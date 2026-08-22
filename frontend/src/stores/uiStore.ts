import { create } from 'zustand';

// 전역 UI 상태 — 홈 이동 가드(FR-25), 모달, 미제출 입력 플래그

interface UiStoreState {
  /** 미제출 답변/업로드 중 파일 등 이탈 시 확인이 필요한 입력 존재 여부 */
  hasUnsavedInput: boolean;
  setHasUnsavedInput(dirty: boolean): void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  hasUnsavedInput: false,
  setHasUnsavedInput(hasUnsavedInput) {
    set({ hasUnsavedInput });
  },
}));
