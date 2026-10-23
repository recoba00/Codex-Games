// Steam 로그인 티켓 검증 (상세 09 "Steamworks 인증, 계정 자동 생성").
// 클라이언트: Steamworks GetAuthTicketForWebApi(STEAM_TICKET_IDENTITY) → 티켓(hex)을 서버로 보냄.
// 서버: ISteamUserAuth/AuthenticateUserTicket(퍼블리셔 키)로 확인 → SteamID64.
const STEAM_API = "https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/";

export async function verifySteamTicket(env, ticket, fetcher = fetch) {
  if (!env.STEAM_WEB_API_KEY || !env.STEAM_APP_ID) throw new Error("steam_not_configured");
  if (!/^[0-9a-fA-F]{16,4096}$/.test(String(ticket ?? ""))) throw new Error("steam_ticket_invalid");
  const url = new URL(STEAM_API);
  url.searchParams.set("key", env.STEAM_WEB_API_KEY);
  url.searchParams.set("appid", String(env.STEAM_APP_ID));
  url.searchParams.set("ticket", ticket);
  if (env.STEAM_TICKET_IDENTITY) url.searchParams.set("identity", env.STEAM_TICKET_IDENTITY);

  const response = await fetcher(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("steam_unavailable");
  const body = await response.json().catch(() => null);
  const params = body?.response?.params;
  if (!params || params.result !== "OK" || !/^\d{17}$/.test(String(params.steamid ?? ""))) {
    throw new Error("steam_ticket_rejected");
  }
  if (params.publisherbanned) throw new Error("account_banned");
  // ownersteamid ≠ steamid 는 패밀리 공유. 기록만 하고 막지 않는다(정책은 기획 결정 필요).
  return { steamId: String(params.steamid), ownerSteamId: String(params.ownersteamid ?? params.steamid), vacBanned: Boolean(params.vacbanned) };
}
