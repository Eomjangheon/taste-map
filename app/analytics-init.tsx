"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// 세션당 1회 app_opened 기록 — 7일차 리텐션(D7)·G1~G3 판별의 기준 이벤트
export default function AnalyticsInit() {
  useEffect(() => {
    try {
      const KEY = "tm_app_opened";
      if (!window.sessionStorage.getItem(KEY)) {
        window.sessionStorage.setItem(KEY, "1");
        track("app_opened");
      }
    } catch {
      // sessionStorage 접근 불가 환경 — 무시
    }
  }, []);

  return null;
}
