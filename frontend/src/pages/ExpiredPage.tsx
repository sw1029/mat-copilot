import { useNavigate } from 'react-router-dom';
import { Button } from '../shared/ui/Button';
import { useSessionStore } from '../stores/sessionStore';
import styles from './ExpiredPage.module.css';

// TRD §4.5 /expired — 만료/유실 안내. 토큰 폐기 후 새 세션 CTA.

export function ExpiredPage() {
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clearSession);

  return (
    <section className={styles.container} aria-labelledby="expired-title">
      <div className={styles.card}>
        <h1 id="expired-title" className={styles.title}>
          세션이 만료됐어요
        </h1>
        <p className={styles.message}>
          세션과 제출 데이터는 보존 기간이 지나 안전하게 파기됐어요. 새 세션으로 다시 시작할 수
          있어요.
        </p>
        <Button
          onClick={() => {
            clearSession('new-session');
            navigate('/');
          }}
        >
          새 세션 시작
        </Button>
      </div>
    </section>
  );
}
