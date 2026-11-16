import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { authStorage, isWebPlatform } from "./platform";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://unconfigured.supabase.co";
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "public-anon-placeholder";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWebPlatform(),
    flowType: "pkce",
  },
});
