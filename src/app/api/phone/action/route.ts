import { POST as unifiedPost } from '@/app/api/control/action/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Backwards-compatible alias. New UI/AI calls use /api/control/action directly. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return new Response(JSON.stringify({ok:false,error:'Invalid JSON body'}), {status:400,headers:{'content-type':'application/json'}});
  return unifiedPost(new Request(request.url, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,target:'phone'})}));
}
