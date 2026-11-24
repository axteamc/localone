export { VISIT_COLLECTION_PALETTE as VISIT_PALETTE } from "../../theme/tokens";

export function collectionTone(libraryId: number, palette: readonly string[]): string {
  return palette[((libraryId % palette.length) + palette.length) % palette.length]!;
}
