import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSession } from '../shared/api/endpoints';
import { asErrorViewModel, isSessionGoneError } from '../shared/api/errors';
import { routeForAppStatus, mapServerStatus, useSessionStore } from '../stores/sessionStore';

// TRD/front.md §5.5 복구 순서: 앱 부팅 → token 확인 → API-02 → 상태 매핑표로 route replace

export function useBootstrap(): boolean {
  const navigate = useNavigate();
  const location = useLocation();
  const bootstrapped = useSessionStore((s) => s.bootstrapped);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const { sessionToken, sessionId, setFromServer, setBootstrapped, clearSession } =
      useSessionStore.getState();

    if (!sessionToken || !sessionId) {
      setBootstrapped();
      return;
    }

    // 전역 1회 부팅 작업 — StrictMode 이중 이펙트에서도 결과 반영과
    // setBootstrapped()는 반드시 수행되어야 하므로 취소하지 않는다.
    void (async () => {
      try {
        const session = await getSession(sessionId);
        setFromServer(session);
        const appStatus = mapServerStatus(session.status);
        const target = routeForAppStatus(appStatus, session.activeJobId);
        // 홈 진입 시에는 이어하기 배너로 안내하고 홈에 머무른다 (PRD §5.1)
        if (location.pathname !== '/' && location.pathname !== target) {
          navigate(target, { replace: true });
        }
      } catch (error) {
        const vm = asErrorViewModel(error);
        if (isSessionGoneError(vm)) {
          clearSession('expired');
          navigate('/expired', { replace: true });
        } else {
          // 그 외 오류(네트워크 등)는 세션 확인 불가 — lastError로 알리고
          // 각 화면의 오류 UI/새 세션 CTA로 복구한다 (dead-end 금지, TRD §12)
          useSessionStore.getState().setLastError(vm);
        }
      } finally {
        useSessionStore.getState().setBootstrapped();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return bootstrapped;
}
