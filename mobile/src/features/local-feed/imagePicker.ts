/**
 * 사진 고르기·찍기 (contracts/local-feed.md LOCAL-1 C4 — B의 플랫폼 분기 파일 하나).
 * - iOS·Android: expo-image-picker 카메라·사진첩
 * - 웹: 사진첩만. 카메라는 null(화면이 "앨범에서 골라 주세요"로 안내)
 * - 올리기 전 긴 변 2048·JPEG로 줄인다(서버가 한 번 더 위치 정보를 지운다).
 * 사진의 위치 정보(EXIF)는 앱에서 읽거나 보내지 않는다(exif: false).
 */
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export const POST_IMAGE_LONG_EDGE = 2048;

export async function pickPostImage(source: "camera" | "library"): Promise<{ uri: string } | null> {
  if (source === "camera" && Platform.OS === "web") return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: await shrinkForUpload(asset.uri, asset.width, asset.height) };
}

export async function shrinkForUpload(uri: string, width: number, height: number): Promise<string> {
  const longEdge = Math.max(width, height);
  const resize = longEdge > POST_IMAGE_LONG_EDGE
    ? [width >= height ? { resize: { width: POST_IMAGE_LONG_EDGE } } : { resize: { height: POST_IMAGE_LONG_EDGE } }]
    : [];
  const out = await ImageManipulator.manipulateAsync(uri, resize, { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  return out.uri;
}
