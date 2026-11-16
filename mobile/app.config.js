// app.json을 그대로 읽고, Apple 로그인 켜기 설정이 "true"일 때만 Sign in with Apple 권한을 넣는다(AUTH-1 C4).
// 왜: 무료(개인 팀) Apple 계정은 Sign in with Apple 권한을 쓸 수 없어서, 권한이 들어가면 아이폰 설치용 서명이 막힌다.
//     expo-apple-authentication은 설치돼 있기만 해도 Expo 자동 플러그인이 권한을 넣으므로,
//     꺼져 있을 때는 마지막에 그 권한 키를 지운다.
// 계정이 생기면 EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true만 바꾼다(mobile/src/auth/platform.ts도 같은 값을 본다).
const { withEntitlementsPlist } = require("expo/config-plugins");

const APPLE_SIGNIN_ENTITLEMENT = "com.apple.developer.applesignin";

const withoutAppleSignIn = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults[APPLE_SIGNIN_ENTITLEMENT];
    return mod;
  });

module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === "true") {
    return {
      ...config,
      plugins: [...(config.plugins ?? []), "expo-apple-authentication"],
      ios: { ...config.ios, usesAppleSignIn: true },
    };
  }
  return {
    ...config,
    plugins: [...(config.plugins ?? []), withoutAppleSignIn],
  };
};
