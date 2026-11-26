package lab.replay;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
class ReplayStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    ReplayStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Entry insert(UUID owner, ReplayController.Fixture fixture, ReplayController.Comparison comparison) {
        return jdbc.queryForObject("""
            INSERT INTO replay_runs (owner_id, order_id, comparison, fixture)
            VALUES (?, ?, CAST(? AS jsonb), CAST(? AS jsonb))
            RETURNING id, created_at
            """, (rs, row) -> new Entry(rs.getObject(1, UUID.class), rs.getObject(2, OffsetDateTime.class),
                fixture.orderId(), comparison, false), owner, fixture.orderId(), write(comparison), write(fixture));
    }

    List<Entry> history(UUID owner, boolean saved, int offset) {
        return jdbc.query("""
            SELECT r.id, r.created_at, r.order_id, r.comparison, s.run_id IS NOT NULL AS saved
            FROM replay_runs r
            LEFT JOIN replay_regressions s ON s.owner_id = r.owner_id AND s.run_id = r.id
            WHERE r.owner_id = ? AND (NOT ? OR s.run_id IS NOT NULL)
            ORDER BY CASE WHEN ? THEN s.created_at ELSE r.created_at END DESC, r.id DESC
            LIMIT 25 OFFSET ?
            """, (rs, row) -> new Entry(rs.getObject(1, UUID.class), rs.getObject(2, OffsetDateTime.class),
                rs.getString(3), read(rs.getString(4), ReplayController.Comparison.class), rs.getBoolean(5)),
            owner, saved, saved, offset);
    }

    void save(UUID owner, UUID run) {
        int count = jdbc.update("""
            INSERT INTO replay_regressions (owner_id, run_id)
            SELECT owner_id, id FROM replay_runs WHERE owner_id = ? AND id = ?
            ON CONFLICT (owner_id, run_id) DO NOTHING
            """, owner, run);
        if (count == 0 && !Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM replay_regressions WHERE owner_id = ? AND run_id = ?)
            """, Boolean.class, owner, run))) throw notFound();
    }

    ReplayController.Fixture savedFixture(UUID owner, UUID run) {
        return jdbc.query("""
            SELECT r.fixture FROM replay_runs r
            JOIN replay_regressions s ON s.owner_id = r.owner_id AND s.run_id = r.id
            WHERE r.owner_id = ? AND r.id = ?
            """, (rs, row) -> read(rs.getString(1), ReplayController.Fixture.class), owner, run)
            .stream().findFirst().orElseThrow(this::notFound);
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize replay data", exception);
        }
    }

    private <T> T read(String value, Class<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not read stored replay data", exception);
        }
    }

    record Entry(UUID id, OffsetDateTime createdAt, String orderId, ReplayController.Comparison comparison, boolean saved) {}
}
