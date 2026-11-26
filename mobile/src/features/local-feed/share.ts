// 게시물 공유(contracts/local-feed.md LOCAL-2 H11·C4) — B의 두 번째 플랫폼 분기 파일.
// 앱: 시스템 공유창(Share.share). 웹: navigator.share가 있으면 그것, 없으면 클립보드 복사.
import { Platform, Share } from "react-native";

export const SHARE_TEXT = {
  copied: "링크를 복사했어요",
  failed: "공유하지 못했어요. 다시 시도해 주세요.",
} as const;

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

type WebNavigator = {
  share?: (data: { url: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

/** 공유할 주소. 웹 기준 주소(EXPO_PUBLIC_WEB_URL, 웹에서는 지금 주소)가 있으면 `<기준>/posts/<id>`, 없으면 앱 딥링크 */
export function postShareUrl(postId: string): string {
  return shareUrl("posts", postId);
}

/** C-97 MY-4 M4-10: 프로필 주소 `<기준>/users/<profile_id>`, 없으면 `localone://users/<profile_id>` */
export function profileShareUrl(profileId: string): string {
  return shareUrl("users", profileId);
}

function shareUrl(path: "posts" | "users", rawId: string): string {
  const id = encodeURIComponent(rawId);
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/+$/, "");
  const origin =
    configured ||
    (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");
  return origin ? `${origin}/${path}/${id}` : `localone://${path}/${id}`;
}

async function shareOnWeb(url: string): Promise<ShareOutcome> {
  const nav = (globalThis as { navigator?: WebNavigator }).navigator;
  if (typeof nav?.share === "function") {
    try {
      await nav.share({ url });
      return "shared";
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "dismissed"; // 사용자가 닫음
      // 공유창을 못 열면 복사로 넘어간다
    }
  }
  if (typeof nav?.clipboard?.writeText !== "function") return "failed";
  try {
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function sharePost(postId: string): Promise<ShareOutcome> {
  return shareLink(postShareUrl(postId));
}

export async function shareProfile(profileId: string): Promise<ShareOutcome> {
  return shareLink(profileShareUrl(profileId));
}

async function shareLink(url: string): Promise<ShareOutcome> {
  if (Platform.OS === "web") return shareOnWeb(url);
  try {
    const result = await Share.share({ url, message: url });
    return result.action === Share.dismissedAction ? "dismissed" : "shared";
  } catch {
    return "failed";
  }
}

/** 결과에 맞는 한 줄 안내(없으면 null) */
export function shareNotice(outcome: ShareOutcome): string | null {
  if (outcome === "copied") return SHARE_TEXT.copied;
  if (outcome === "failed") return SHARE_TEXT.failed;
  return null;
}
