package lab.replay;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/account")
class AccountsController {
    private static final String SESSION_ACCOUNT = "workspaceAccount";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;

    AccountsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    Account current(HttpServletRequest request) {
        return requireAccount(request);
    }

    @PatchMapping(consumes = "application/json")
    Account updateProfile(@RequestBody ProfileUpdate input, HttpServletRequest request) {
        Account current = requireAccount(request);
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty() || name.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a display name of 1–100 characters.");
        }

        int updated = jdbc.update("UPDATE replay_users SET display_name = ? WHERE id = ?", name, current.id());
        if (updated != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        Account profile = new Account(current.id(), name, current.email(), current.type(), current.organization());
        request.getSession(false).setAttribute(SESSION_ACCOUNT, profile);
        return profile;
    }

    @PostMapping(value = "/signup", consumes = "application/json")
    Account signup(@RequestBody Credentials input, HttpServletRequest request) {
        String email = email(input.email());
        String organization = organization(input);
        if (input.name() == null || input.name().strip().isEmpty() || input.name().length() > 100
            || input.password() == null || input.password().length() < 12 || input.password().length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a name and a password of 12–128 characters.");
        }
        Account account = new Account(UUID.randomUUID(), input.name().strip(), email, input.type(), organization);
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        String hash = Base64.getEncoder().encodeToString(derive(input.password(), salt));
        try {
            jdbc.update("""
                INSERT INTO replay_users (id, email, account_type, organization, display_name, salt, password_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, account.id(), email, account.type(), organization, account.name(), Base64.getEncoder().encodeToString(salt), hash);
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account already exists. Sign in instead.");
        }
        return startSession(request, account);
    }

    @PostMapping(value = "/login", consumes = "application/json")
    Account login(@RequestBody Credentials input, HttpServletRequest request) {
        String email = email(input.email());
        String organization = organization(input);
        if (input.password() == null || input.password().length() > 128) throw invalidLogin();
        var users = jdbc.query("""
            SELECT display_name, salt, password_hash, id, organization FROM replay_users
            WHERE email = ? AND account_type = ? AND lower(organization) = ?
            """, (rs, row) -> new StoredUser(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getObject(4, UUID.class), rs.getString(5)),
            email, input.type(), organization.toLowerCase(Locale.ROOT));
        StoredUser stored = users.isEmpty() ? null : users.getFirst();
        byte[] salt = stored == null ? new byte[16] : Base64.getDecoder().decode(stored.salt());
        byte[] expected = stored == null ? new byte[32] : Base64.getDecoder().decode(stored.hash());
        if (!MessageDigest.isEqual(derive(input.password(), salt), expected) || stored == null) throw invalidLogin();
        return startSession(request, new Account(stored.id(), stored.name(), email, input.type(), stored.organization()));
    }

    @PostMapping(value = "/logout", consumes = "application/json")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
    }

    static Account requireAccount(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || !(session.getAttribute(SESSION_ACCOUNT) instanceof Account account)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return account;
    }

    private Account startSession(HttpServletRequest request, Account account) {
        HttpSession existing = request.getSession(false);
        if (existing != null) existing.invalidate();
        request.getSession(true).setAttribute(SESSION_ACCOUNT, account);
        return account;
    }

    private String email(String value) {
        if (value == null || value.length() > 254 || !value.strip().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
        }
        return value.strip().toLowerCase(Locale.ROOT);
    }

    private String organization(Credentials input) {
        if ("individual".equals(input.type())) return "";
        if (!"organization".equals(input.type()) || input.organization() == null
            || input.organization().strip().isEmpty() || input.organization().length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter an organization name.");
        }
        return input.organization().strip();
    }

    private ResponseStatusException invalidLogin() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Check your account type and sign-in details.");
    }

    private byte[] derive(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 600_000, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException(exception);
        } finally {
            spec.clearPassword();
        }
    }

    record Account(UUID id, String name, String email, String type, String organization) {}
    record ProfileUpdate(String name) {}
    record Credentials(String name, String email, String password, String type, String organization) {}
    record StoredUser(String name, String salt, String hash, UUID id, String organization) {}
}
