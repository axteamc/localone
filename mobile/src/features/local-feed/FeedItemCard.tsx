// VISIT-3-P3 혼합 피드 카드 한 장 — contracts/local-feed.md VISIT-3 C2 `FeedItemCard`, V3-8
// `kind`로 나눠 post는 기존 PostCard 그대로, guestbook은 GuestbookCard. 모르는 kind는 그리지 않는다(뒤 Step 호환).
import React from "react";
import { isGuestbookItem, isPostItem, type FeedItem } from "./api";
import { GuestbookCard } from "./GuestbookCard";
import { PostCard } from "./PostCard";

export type FeedItemCardProps = {
  item: FeedItem;
  width: number;
  onOpenPost(postId: string): void;
  onMenu?(item: FeedItem): void;
};

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
  return null;
}
