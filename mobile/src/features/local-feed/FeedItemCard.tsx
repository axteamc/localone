// VISIT-3-P3 혼합 피드 카드 한 장 — contracts/local-feed.md VISIT-3 C2 `FeedItemCard`, V3-8
// `kind`로 나눠 post는 기존 PostCard 그대로, guestbook은 GuestbookCard, club은 ClubCard(CLUB-1). 모르는 kind는 그리지 않는다(뒤 Step 호환).
import { useRouter } from "expo-router";
import React from "react";
import { ClubCard } from "../book-club/ClubCard";
import type { ClubItem } from "../book-club/api";
import { isGuestbookItem, isPostItem, type FeedItem } from "./api";
import { GuestbookCard } from "./GuestbookCard";
import { PostCard } from "./PostCard";

export type FeedItemCardProps = {
  item: FeedItem;
  width: number;
  onOpenPost(postId: string): void;
  onMenu?(item: FeedItem): void;
};

function isClubItem(item: FeedItem): item is { kind: "club"; club: ClubItem } {
  // 모양이 맞는 모임만 그린다(이름·id가 없는 항목은 모르는 종류처럼 건너뜀)
  const club = (item as { club?: unknown }).club as Partial<ClubItem> | null | undefined;
  return item.kind === "club" && typeof club === "object" && club !== null
    && typeof club.id === "string" && typeof club.name === "string" && typeof club.status === "string";
}

export function FeedItemCard({ item, width, onOpenPost, onMenu }: FeedItemCardProps) {
  if (isPostItem(item)) {
    return (
      <PostCard
        post={item.post}
        width={width}
        onPress={onOpenPost}
        onMenu={onMenu ? (post) => onMenu({ kind: "post", post }) : undefined}
      />
    );
  }
  if (isGuestbookItem(item)) {
    return (
      <GuestbookCard
        entry={item.guestbook}
        width={width}
        onMenu={onMenu ? (entry) => onMenu({ kind: "guestbook", guestbook: entry }) : undefined}
      />
    );
  }
  if (isClubItem(item)) return <ClubFeedCard club={item.club} width={width} />; // CLUB-1-P3

  return null;
}

/** CLUB-1 K1-11: 모임 카드를 누르면 모임 화면 `/clubs/[clubId]` */
function ClubFeedCard({ club, width }: { club: ClubItem; width: number }) {
  const router = useRouter();
  return (
    <ClubCard club={club} width={width} onOpen={(clubId) => router.push({ pathname: "/clubs/[clubId]", params: { clubId } })} />
  );
}
