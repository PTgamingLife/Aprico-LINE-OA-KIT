-- Frozen card snapshot; this file creates no cron job and does not enable sending.
begin;
insert into public.line_oa_kit_intro_control(id,cards) values(true,'[{"title":"不只寄出訊息，讓顧客真的走近你。","body":"為什麼把服務入口放進 LINE？\n\n① 對話更順手\n熟悉 LINE 的顧客，可在聊天室詢問與接續互動。\n\n② 功能不用到處找\n把服務介紹、活動與表單連結，集中在圖文選單。\n\n③ 常見問題先接住\n設定關鍵字與固定回覆，重複問題不用每次重打。\n\nEmail 適合長文與正式通知；LINE OA 適合即時對話與互動入口，兩者可以互補。\n\n提醒：需顧客加入好友或完成必要授權；不保證觸及、已讀或成交，訊息費另依 LINE 方案。","buttonLabel":"免費看看我的 OA","url":"https://liff.line.me/2012197506-Vmb4O5iT/design.html","imageUrl":"","theme":"sage"},{"title":"專業起步，不必先砸大預算。","body":"委託建置，常要分項規劃與報價\n公開案例（宜佳網路科技）：帳號建立＋視覺設計 NT$15,000；單張圖文選單設計 NT$5,000。此為同一業者的不同服務項目，不相加。\n\nAprico AI Studio｜自己掌握設計\n原價 NT$6,660\n優惠期間 NT$3,860／單一專案\n包含 5 次 AI 建置，非訂閱。\n\n選 4／6／8 格 → 套用配色與印花 → 填入需求 → AI 產生草稿，依圖解授權部署。先免費預覽，再決定是否購買。\n\n本系統販售教學與工具，不是全客製代工；功能範圍不同，不是同規格比價。仍需本人申請帳號、授權並驗收。加購模組及 LINE／雲端／營運 AI 費用另計。\n\n案例價格核對：2026-10-30；實際依業者報價。LINE OA 帳號本身可免費申請，不需付這筆代建費才能開戶。\n報價來源：https://www.echia.net/line/linebiz-pricing","buttonLabel":"先免費設計我的 OA","url":"https://liff.line.me/2012197506-Vmb4O5iT/design.html","imageUrl":"","theme":"clay"}]'::jsonb) on conflict(id) do nothing;
insert into public.line_oa_kit_intro_jobs(dedupe_key,kind,card,config,scheduled_at,expires_at)
select 'aprico-intro-20261031-1','broadcast',1,cards->0,'2026-10-31T01:00:00Z'::timestamptz,'2026-10-31T03:00:00Z'::timestamptz from public.line_oa_kit_intro_control where id
union all
select 'aprico-intro-20261101-2','broadcast',2,cards->1,'2026-11-01T01:00:00Z'::timestamptz,'2026-11-01T03:00:00Z'::timestamptz from public.line_oa_kit_intro_control where id
on conflict(dedupe_key) do nothing;
commit;
