package lab.replay;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/teams")
class TeamsController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    TeamsController(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @GetMapping
    List<Team> list(HttpServletRequest request) {
        UUID user = organizationAccount(request).id();
        return jdbc.query("""
            SELECT t.id, t.name, t.manager_id = ? FROM replay_teams t
            WHERE t.manager_id = ? OR EXISTS (
              SELECT 1 FROM replay_team_members m WHERE m.team_id = t.id AND m.user_id = ?)
            ORDER BY t.name, t.id
            """, (rs, row) -> new Team(rs.getObject(1, UUID.class), rs.getString(2), rs.getBoolean(3)), user, user, user);
    }

    @PostMapping(consumes = "application/json")
    Team create(@RequestBody TeamInput input, HttpServletRequest request) {
        UUID user = organizationAccount(request).id();
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty() || name.length() > 100) throw error(HttpStatus.BAD_REQUEST);
        try {
            UUID id = jdbc.queryForObject("INSERT INTO replay_teams(manager_id, name) VALUES (?, ?) RETURNING id",
                UUID.class, user, name);
            return new Team(id, name, true);
        } catch (DuplicateKeyException exception) {
            throw error(HttpStatus.CONFLICT);
        }
    }

    @PostMapping(value = "/{id}/invitations", consumes = "application/json")
    Invitation invite(@PathVariable UUID id, @RequestBody InviteInput input, HttpServletRequest request) {
        UUID user = organizationAccount(request).id();
        if (!exists("SELECT EXISTS(SELECT 1 FROM replay_teams WHERE id = ? AND manager_id = ?)", id, user)) {
            throw error(HttpStatus.NOT_FOUND);
        }
        String email = input.email() == null ? "" : input.email().strip().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            throw error(HttpStatus.BAD_REQUEST);
        }
        UUID token = jdbc.queryForObject("""
            INSERT INTO replay_team_invites(team_id, email) VALUES (?, ?)
            ON CONFLICT(team_id, email) DO UPDATE
            SET token = gen_random_uuid(), expires_at = now() + interval '7 days'
            RETURNING token
            """, UUID.class, id, email);
        return new Invitation(token);
    }

    @PostMapping(value = "/join", consumes = "application/json")
    void join(@RequestBody JoinInput input, HttpServletRequest request) {
        var account = organizationAccount(request);
        int claimed = jdbc.queryForObject("""
            WITH claimed AS (
              DELETE FROM replay_team_invites i USING replay_teams t, replay_users manager
              WHERE i.token = ? AND i.email = ? AND i.expires_at > now()
                AND i.team_id = t.id AND t.manager_id = manager.id
                AND lower(manager.organization) = lower(?)
              RETURNING i.team_id
            ), joined AS (
              INSERT INTO replay_team_members(team_id, user_id)
              SELECT team_id, ? FROM claimed ON CONFLICT DO NOTHING RETURNING team_id
            )
            SELECT count(*) FROM claimed
            """, Integer.class, input.token(), account.email(), account.organization(), account.id());
        if (claimed == 0) throw error(HttpStatus.NOT_FOUND);
    }

    @GetMapping("/{id}")
    TeamDetails details(@PathVariable UUID id, HttpServletRequest request) {
        requireMember(id, organizationAccount(request).id());
        List<Member> members = jdbc.query("""
            SELECT u.display_name, u.email, u.id = t.manager_id
            FROM replay_teams t JOIN replay_users u ON u.id = t.manager_id OR EXISTS(
              SELECT 1 FROM replay_team_members m WHERE m.team_id = t.id AND m.user_id = u.id)
            WHERE t.id = ? ORDER BY (u.id = t.manager_id) DESC, u.display_name, u.id
            """, (rs, row) -> new Member(rs.getString(1), rs.getString(2), rs.getBoolean(3)), id);
        Summary summary = jdbc.queryForObject("""
            SELECT count(*), count(*) FILTER (WHERE r.comparison @> '{"fixVerified":true}')
            FROM replay_team_runs s JOIN replay_runs r ON r.id = s.run_id WHERE s.team_id = ?
            """, (rs, row) -> new Summary(rs.getLong(1), rs.getLong(2)), id);
        List<Test> tests = jdbc.query("""
            SELECT r.id, r.order_id, r.comparison FROM replay_team_runs s
            JOIN replay_runs r ON r.id = s.run_id WHERE s.team_id = ?
            ORDER BY s.shared_at DESC, r.id DESC
            """, (rs, row) -> new Test(rs.getObject(1, UUID.class), rs.getString(2), comparison(rs.getString(3))), id);
        return new TeamDetails(members, summary, tests);
    }

    @PostMapping(value = "/{id}/runs", consumes = "application/json")
    void share(@PathVariable UUID id, @RequestBody ShareInput input, HttpServletRequest request) {
        UUID user = organizationAccount(request).id();
        requireMember(id, user);
        if (!exists("SELECT EXISTS(SELECT 1 FROM replay_runs WHERE id = ? AND owner_id = ?)", input.runId(), user)) {
            throw error(HttpStatus.NOT_FOUND);
        }
        jdbc.update("INSERT INTO replay_team_runs(team_id, run_id) VALUES (?, ?) ON CONFLICT DO NOTHING", id, input.runId());
    }

    private void requireMember(UUID team, UUID user) {
        if (!exists("""
            SELECT EXISTS(SELECT 1 FROM replay_teams t WHERE t.id = ? AND (t.manager_id = ?
                OR EXISTS(SELECT 1 FROM replay_team_members m WHERE m.team_id = t.id AND m.user_id = ?)))
            """, team, user, user)) throw error(HttpStatus.NOT_FOUND);
    }

    private boolean exists(String sql, Object... parameters) {
        return Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, parameters));
    }

    private AccountsController.Account organizationAccount(HttpServletRequest request) {
        var account = AccountsController.requireAccount(request);
        if (!"organization".equals(account.type())) throw error(HttpStatus.FORBIDDEN);
        return account;
    }

    private JsonNode comparison(String source) {
        try {
            return json.readTree(source);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not read comparison", exception);
        }
    }

    private ResponseStatusException error(HttpStatus status) {
        return new ResponseStatusException(status);
    }

    record Team(UUID id, String name, boolean manager) {}
    record Member(String name, String email, boolean manager) {}
    record Summary(long sharedTests, long verifiedFixes) {}
    record Test(UUID id, String orderId, JsonNode comparison) {}
    record TeamDetails(List<Member> members, Summary summary, List<Test> tests) {}
    record TeamInput(String name) {}
    record InviteInput(String email) {}
    record JoinInput(UUID token) {}
    record Invitation(UUID token) {}
    record ShareInput(UUID runId) {}
}
