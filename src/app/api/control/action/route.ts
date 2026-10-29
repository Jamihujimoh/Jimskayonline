import { NextResponse } from 'next/server';
import { runPcControl } from '@/ai/lib/pc-control-core';
import { claimAndroidPhoneTask, completeAndroidPhoneTask, getAndroidPhoneTaskStatus, listAndroidPhones, registerAndroidPhone, runAndroidAgentTask, touchAndroidPhone } from '@/ai/lib/local-agent-bridge';
import { validateControlPin } from '@/ai/lib/control-hub';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
function bad(error: string, status = 400) { return NextResponse.json({ ok:false, error }, { status }); }
export async function POST(request: Request) {
  let body:any; try { body=await request.json(); } catch { return bad('Invalid JSON body',400); }
  if (!validateControlPin(body?.pin)) return bad('Invalid or missing admin PIN',401);
  const operation=String(body?.operation||'').trim();
  if (operation==='phoneStatus') {
    const userId=String(body?.userId||'').trim();
    if(!userId)return bad('userId is required');
    const phone=(await listAndroidPhones(userId))[0];
    return NextResponse.json({ok:true,connected:!!phone?.online,device:phone?.name});
  }
  if (operation==='taskStatus') {
    const userId=String(body?.userId||'').trim(), deviceId=String(body?.deviceId||'').trim(), taskId=String(body?.taskId||'').trim();
    if(!userId||!deviceId||!taskId)return bad('userId, deviceId, and taskId are required');
    const task=await getAndroidPhoneTaskStatus(userId,deviceId,taskId);
    return task?NextResponse.json({ok:true,...task}):bad('Phone task not found',404);
  }
  if (operation==='register') {
    const deviceId=String(body?.deviceId||'').trim(), userId=String(body?.userId||'').trim();
    if(!deviceId||!userId)return bad('deviceId and userId are required');
    try {
      return NextResponse.json({ok:true,phone:await registerAndroidPhone(deviceId,userId,String(body?.name||deviceId))});
    } catch (error) {
      return bad(error instanceof Error ? error.message : 'Phone registration failed.', 403);
    }
  }
  if (operation==='heartbeat') {
    const deviceId=String(body?.deviceId||'').trim(), userId=String(body?.userId||'').trim();
    if(!await touchAndroidPhone(deviceId,userId,String(body?.name||'')))return bad('Phone is not registered',404);
    return NextResponse.json({ok:true,online:true,at:Date.now()});
  }
  if (operation==='poll') {
    const deviceId=String(body?.deviceId||'').trim(), userId=String(body?.userId||'').trim();
    const task=await claimAndroidPhoneTask(deviceId,userId);
    if(!task)return NextResponse.json({ok:true,task:null});
    return NextResponse.json({ok:true,task:{id:task.id,action:task.action,input:task.input}});
  }
  if (operation==='result') {
    const deviceId=String(body?.deviceId||'').trim(), userId=String(body?.userId||'').trim(), taskId=String(body?.taskId||'').trim();
    if(!taskId||!await completeAndroidPhoneTask(deviceId,userId,taskId,body?.success===true,body?.output,body?.error))return bad('Task not found or not owned by this phone',404);
    return NextResponse.json({ok:true});
  }
  const target=String(body?.target||'').trim();
  if(target==='phone') {
    const userId=String(body?.userId||'').trim(), action=String(body?.action||'').trim();
    const input=body?.input&&typeof body.input==='object'&&!Array.isArray(body.input)?{...body.input}:{};
    if(!userId||!action)return bad('userId and action are required');
    const result=await runAndroidAgentTask({userId,action,input,timeoutMs:Number(body?.timeoutMs)||undefined});
    return NextResponse.json(result,{status:result.ok?200:400});
  }
  if(target==='pc') {
    const command=String(body?.command||'').trim(); if(!command)return bad('command is required');
    const args=body?.args&&typeof body.args==='object'&&!Array.isArray(body.args)?body.args:{};
    const result=await runPcControl({command,args,confirm:body?.confirm===true,timeoutMs:typeof body?.timeoutMs==='number'?body.timeoutMs:undefined});
    return NextResponse.json(result,{status:result.ok?200:400});
  }
  if(body?.taskId)return bad('Task status lookup is unavailable for phone actions.',404);
  return bad('target must be "pc" or "phone"');
}
