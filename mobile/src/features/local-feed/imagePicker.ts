// 게시물 사진 고르기·줄이기·올릴 묶음 만들기 — local-feed 계약 C4가 허용한 B의 플랫폼 분기 파일 하나.
// 화면은 Platform.OS를 직접 보지 않고 여기만 부른다.
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

const LONG_SIDE = 2048;
const JPEG_COMPRESS = 0.85;

export type PickSource = "camera" | "library";

/** 웹에는 카메라가 없어 null을 준다(화면이 앨범 안내를 띄운다). */
export function canUseCamera(): boolean {
  return Platform.OS !== "web";
}

async function shrink(uri: string, width: number, height: number): Promise<string> {
  const longSide = Math.max(width, height);
  const resize =
    longSide > LONG_SIDE
      ? [{ resize: width >= height ? { width: LONG_SIDE } : { height: LONG_SIDE } }]
      : [];
  // 다시 JPEG로 저장하면 원본 메타데이터가 붙지 않는다. 서버가 한 번 더 지운다(F3)
  const out = await ImageManipulator.manipulateAsync(uri, resize, {
    compress: JPEG_COMPRESS,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

/** 사진 한 장을 고르거나 찍어 긴 변 2048·JPEG로 줄인다. 취소·권한 거부·웹 카메라는 null. */
export async function pickPostImage(source: PickSource): Promise<{ uri: string } | null> {
  if (source === "camera") {
    if (!canUseCamera()) return null;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
    exif: false, // 위치 정보를 앱에서 읽지 않는다(계약 P2 금지 사항)
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  return { uri: await shrink(asset.uri, asset.width, asset.height) };
}

/** #23에 보낼 multipart 묶음. 웹은 blob, 휴대폰은 파일 주소를 그대로 넣는다. */
export async function buildImageFormData(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("image", blob, "photo.jpg");
  } else {
    form.append("image", { uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}
