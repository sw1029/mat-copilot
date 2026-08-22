import { useLiveRegionStore } from '../a11y/liveRegion';

// 전역 aria-live 출력 영역 (TRD §9.4). AppShell에 1회 마운트.

export function LiveRegionOutlet() {
  const politeMessage = useLiveRegionStore((s) => s.politeMessage);
  const assertiveMessage = useLiveRegionStore((s) => s.assertiveMessage);
  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {politeMessage}
      </div>
      <div aria-live="assertive" role="alert" className="sr-only">
        {assertiveMessage}
      </div>
    </>
  );
}
