package lab.replay;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ReplayController {
    private final CheckoutSandbox sandbox;

    private final ReplayStore store;

    ReplayController(CheckoutSandbox sandbox, ReplayStore store) {
        this.sandbox = sandbox;
        this.store = store;
    }

    @PostMapping(value = "/api/replays", consumes = "application/json")
    ReplayStore.Entry replay(@RequestBody ReplayCase request, HttpServletRequest httpRequest) {
        return execute(AccountsController.requireAccount(httpRequest).id(), prepare(request));
    }

    @GetMapping("/api/replays")
    List<ReplayStore.Entry> history(@RequestParam(defaultValue = "false") boolean saved,
                                    @RequestParam(defaultValue = "0") int offset, HttpServletRequest request) {
        require(offset >= 0, "Offset must be non-negative.");
        return store.history(AccountsController.requireAccount(request).id(), saved, offset);
    }

    @PostMapping(value = "/api/replays/{id}/regression", consumes = "application/json")
    void save(@PathVariable UUID id, HttpServletRequest request) {
        store.save(AccountsController.requireAccount(request).id(), id);
    }

    @PostMapping(value = "/api/replays/{id}/rerun", consumes = "application/json")
    ReplayStore.Entry rerun(@PathVariable UUID id, HttpServletRequest request) {
        UUID owner = AccountsController.requireAccount(request).id();
        return execute(owner, store.savedFixture(owner, id));
    }

    private ReplayStore.Entry execute(UUID owner, Fixture fixture) {
        Run original = sandbox.run(fixture, false);
        Run patched = sandbox.run(fixture, true);
        var comparison = new Comparison(fixture.orders().size(), fixture.accounts().size(), original, patched,
            original.status() == 500 && original.payments() == 0
                && patched.status() == 200 && patched.payments() == 1);
        return store.insert(owner, fixture, comparison);
    }

    private Fixture prepare(ReplayCase request) {
        require(request.orderId() != null && request.orders() != null && request.accounts() != null,
            "Provide an order ID, orders and accounts.");
        require(request.orders().size() <= 10_000 && request.accounts().size() <= 10_000,
            "Use at most 10,000 orders and 10,000 accounts.");
        Map<String, Account> accounts = new HashMap<>();
        for (Account account : request.accounts()) {
            require(account != null && identifier(account.id()) && currency(account.currency()),
                "Every account needs a synthetic ID and a three-letter currency.");
            require(accounts.putIfAbsent(account.id(), account) == null, "Account IDs must be unique.");
        }

        var orderIds = new HashSet<String>();
        Order selected = null;
        for (Order order : request.orders()) {
            require(order != null && identifier(order.id()) && identifier(order.accountId())
                && order.amount() > 0 && order.amount() <= 100_000_000
                && (order.currency() == null || currency(order.currency())), "An order has invalid fields.");
            require(orderIds.add(order.id()), "Order IDs must be unique.");
            Account account = accounts.get(order.accountId());
            require(account != null, "Every order must reference an account in the fixture.");
            if (order.id().equals(request.orderId())) selected = order;
        }
        require(selected != null, "The selected order is missing from the fixture.");
        if (request.subset()) {
            return new Fixture(request.orderId(), List.of(selected), List.of(accounts.get(selected.accountId())));
        }
        return new Fixture(request.orderId(), request.orders(), request.accounts());
    }

    private boolean identifier(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{1,64}");
    }

    private boolean currency(String value) {
        return value != null && value.matches("[A-Z]{3}");
    }

    private void require(boolean valid, String message) {
        if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    record ReplayCase(String orderId, boolean subset, List<Order> orders, List<Account> accounts) {}
    record Order(String id, String accountId, int amount, String currency) {}
    record Account(String id, String currency) {}
    record Fixture(String orderId, List<Order> orders, List<Account> accounts) {}
    record Event(String component, String status, String message) {}
    record Run(String release, int status, int payments, List<Event> events) {}
    record Comparison(int orders, int accounts, Run original, Run patched, boolean fixVerified) {}
}

@Service
class CheckoutSandbox {
    private final JdbcTemplate jdbc;

    CheckoutSandbox(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public ReplayController.Run run(ReplayController.Fixture fixture, boolean patched) {
        jdbc.execute("CREATE TEMP TABLE replay_accounts (id text PRIMARY KEY, currency text NOT NULL) ON COMMIT DROP");
        jdbc.execute("""
            CREATE TEMP TABLE replay_orders (id text PRIMARY KEY,
                account_id text REFERENCES pg_temp.replay_accounts(id), amount integer, currency text)
            ON COMMIT DROP
            """);
        jdbc.execute("CREATE TEMP TABLE replay_payments (order_id text PRIMARY KEY, amount integer, currency text) ON COMMIT DROP");
        jdbc.batchUpdate("INSERT INTO pg_temp.replay_accounts VALUES (?, ?)",
            fixture.accounts().stream().map(row -> new Object[]{row.id(), row.currency()}).toList());
        jdbc.batchUpdate("INSERT INTO pg_temp.replay_orders VALUES (?, ?, ?, ?)",
            fixture.orders().stream().map(row -> new Object[]{row.id(), row.accountId(), row.amount(), row.currency()}).toList());

        var order = jdbc.queryForMap("""
            SELECT o.amount, o.currency AS order_currency, a.currency AS account_currency
            FROM pg_temp.replay_orders o JOIN pg_temp.replay_accounts a ON a.id = o.account_id
            WHERE o.id = ?
            """, fixture.orderId());
        var events = new ArrayList<ReplayController.Event>();
        events.add(new ReplayController.Event("PostgreSQL", "passed", "Loaded the selected order and its related account."));
        String currency = (String) order.get("order_currency");
        if (patched && currency == null) currency = (String) order.get("account_currency");
        int status;
        if (currency == null) {
            events.add(new ReplayController.Event("Checkout service", "failed", "MissingOrderFieldException: order currency is missing."));
            events.add(new ReplayController.Event("Payment stub", "skipped", "Checkout stopped before recording a payment."));
            status = 500;
        } else {
            events.add(new ReplayController.Event("Checkout service", "passed", "Resolved checkout currency to " + currency + "."));
            jdbc.update("INSERT INTO pg_temp.replay_payments VALUES (?, ?, ?)", fixture.orderId(), order.get("amount"), currency);
            events.add(new ReplayController.Event("Payment stub", "passed", "Recorded a local payment for the selected order."));
            status = 200;
        }
        int payments = jdbc.queryForObject("SELECT count(*) FROM pg_temp.replay_payments", Integer.class);
        return new ReplayController.Run(patched ? "v2.4.2" : "v2.4.1", status, payments, events);
    }
}
