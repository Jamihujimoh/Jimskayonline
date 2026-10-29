"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Smartphone } from "lucide-react";

type PhoneResult = { ok:boolean; device?:string; deviceId?:string; taskId?:string; pending?:boolean; resultText?:string; error?:string; requiresConfirmation?:boolean };
export type PhoneConsentMode = 'ask' | 'allowAll';
type PhoneAction =
  | "observe" | "runPlan" | "verify" | "openApp" | "listApps" | "openUrl" | "searchWeb"
  | "readScreen" | "tapText" | "tap" | "longPress" | "typeText" | "clearText" | "swipe"
  | "scroll" | "globalAction" | "openSettings" | "launchIntent" | "pickFile" | "listDirectory"
  | "readFile" | "writeFile" | "createDirectory" | "renameFile" | "moveFile" | "copyFile"
  | "deleteFile" | "getFileInfo" | "getSystemInfo";

const ACTION_URL="/api/control/action";

export function PhoneControlPanel({ pin, userId, open, onOpenChange, consentMode, onConsentModeChange }: {
  pin:string;
  userId:string;
  open:boolean;
  onOpenChange:(v:boolean)=>void;
  consentMode:PhoneConsentMode;
  onConsentModeChange:(mode:PhoneConsentMode)=>void;
}) {
  const {toast}=useToast();
  const [busy,setBusy]=useState(false);
  const [app,setApp]=useState(""); const [url,setUrl]=useState(""); const [query,setQuery]=useState("");
  const [text,setText]=useState(""); const [target,setTarget]=useState(""); const [path,setPath]=useState("/storage/emulated/0");
  const [destination,setDestination]=useState(""); const [fileContent,setFileContent]=useState("");
  const [result,setResult]=useState(""); const [connected,setConnected]=useState<boolean|null>(null); const [live,setLive]=useState(false);
  const [plan,setPlan]=useState('[\n  {"action":"observe","observeAfter":true}\n]');

  const run=useCallback(async(action:PhoneAction,input:Record<string,unknown>={},quiet=false)=>{
    setBusy(true);
    try {
      const res=await fetch(ACTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin,userId,target:"phone",action,input})});
      let data=await res.json() as PhoneResult;
      if(data.ok && data.pending && data.taskId && data.deviceId){
        setResult(data.resultText||`Waiting for phone action ${data.taskId}...`);
        for(let attempt=0;attempt<80;attempt+=1){
          await new Promise(resolve=>window.setTimeout(resolve,1500));
          const statusResponse=await fetch(ACTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin,userId,operation:"taskStatus",deviceId:data.deviceId,taskId:data.taskId})});
          if(!statusResponse.ok) continue;
          const status=await statusResponse.json() as {status:string;output?:unknown;error?:string};
          if(status.status==="success"){
            data={...data,pending:false,resultText:JSON.stringify(status.output)};
            break;
          }
          if(status.status==="error"){
            data={...data,ok:false,pending:false,error:status.error||"Phone action failed."};
            break;
          }
        }
      }
      setConnected(data.ok);
      if(data.resultText) setResult(data.resultText);
      if(!data.ok && !quiet) toast({title:"Phone agent",description:data.error,variant:"destructive"});
      return data;
    } finally { setBusy(false); }
  },[pin,userId,toast]);

  useEffect(()=>{
    if(!open || !userId) return;
    let active=true;
    const checkConnection=async()=>{
      try {
        const response=await fetch(ACTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin,userId,operation:"phoneStatus"})});
        const data=await response.json() as {ok:boolean;connected?:boolean};
        if(active) setConnected(response.ok && data.ok && data.connected===true);
      } catch {
        if(active) setConnected(false);
      }
    };
    void checkConnection();
    const timer=window.setInterval(checkConnection,10000);
    return()=>{active=false;window.clearInterval(timer);};
  },[open,pin,userId]);
  useEffect(()=>{ if(!open||!live)return; const t=setInterval(()=>run("getSystemInfo"),10000); return()=>clearInterval(t); },[open,live,run]);

  const runPlan=async()=>{
    try { const steps=JSON.parse(plan); if(!Array.isArray(steps)) throw new Error("Plan must be a JSON array."); await run("runPlan",{steps}); }
    catch(e){ toast({title:"Invalid agent plan",description:e instanceof Error?e.message:String(e),variant:"destructive"}); }
  };
  const pretty=useMemo(()=>{try{return JSON.stringify(JSON.parse(result),null,2)}catch{return result}},[result]);

  return <>
    <button onClick={()=>onOpenChange(!open)} className={cn("fixed right-4 bottom-36 z-[85] h-11 w-11 rounded-full shadow-lg flex items-center justify-center",open?"bg-red-600 text-white":"bg-emerald-600 text-white")} title={open?"Close Phone Agent":"Open Phone Agent"}>📱</button>
    {open&&<aside className="fixed top-16 right-0 bottom-24 z-[80] w-[460px] max-w-[94vw] bg-[#0e0f22] border-l border-white/[.08] shadow-2xl flex flex-col rounded-tl-2xl">
      <div className="px-4 py-3 border-b border-white/[.06] flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Phone AI Agent</h2><p className="text-[11px] text-white/40">Observe → act → verify → recover</p></div><label className="flex gap-2 items-center text-[11px] text-white/50"><Switch checked={live} onCheckedChange={setLive} className="scale-75"/>Live</label></div>
      <ScrollArea className="flex-1"><div className="p-4 space-y-5">
        <section className="rounded-xl border border-white/10 bg-white/[.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Phone connection</span>
            <Badge variant="outline" className="text-[10px]">{connected===false?"Offline":connected===true?"Online":"Checking"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button size="sm" onClick={()=>run("observe")} disabled={busy}>Observe phone</Button>
            <Button size="sm" variant="outline" onClick={()=>run("getSystemInfo")} disabled={busy}>Device info</Button>
          </div>
          {connected !== true && <div className="mt-3 border-t border-white/10 pt-3">
            <p className="text-[11px] text-white/55">Install and pair the native companion to request Android permissions and enable phone actions.</p>
            <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={()=>{window.location.href="jimskay-phone://setup"}}>
              <Smartphone className="mr-2 h-4 w-4" /> Open native companion
            </Button>
          </div>}
        </section>
        {connected && <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-white/50">AI phone permissions</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="AI phone permission mode">
            <Button type="button" size="sm" variant={consentMode==="ask"?"default":"outline"} aria-pressed={consentMode==="ask"} onClick={()=>onConsentModeChange("ask")}>
              Ask permission
            </Button>
            <Button type="button" size="sm" variant={consentMode==="allowAll"?"default":"outline"} aria-pressed={consentMode==="allowAll"} onClick={()=>onConsentModeChange("allowAll")}>
              Allow all
            </Button>
          </div>
          <p className="text-[11px] text-white/45">
            {consentMode==="ask"
              ? "The AI must ask you before each phone action."
              : "The AI may run phone actions without asking each time. Android permissions still apply."}
          </p>
        </section>}

        <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-white/50">Agent plan</h3><p className="text-[11px] text-white/40">Use small steps. The agent can observe between steps and adapt to changing screens.</p><Textarea value={plan} onChange={e=>setPlan(e.target.value)} className="min-h-40 font-mono text-[11px]" /><Button className="w-full" disabled={busy} onClick={runPlan}>Run automation plan</Button></section>

        <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-white/50">Apps & web</h3><div className="flex gap-2"><Input value={app} onChange={e=>setApp(e.target.value)} placeholder="App name or package"/><Button disabled={busy||!app.trim()} onClick={()=>run("openApp",{app:app.trim()})}>Open</Button></div><div className="flex gap-2"><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/><Button disabled={busy||!url.trim()} onClick={()=>run("openUrl",{url:url.trim()})}>Open</Button></div><div className="flex gap-2"><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search web"/><Button disabled={busy||!query.trim()} onClick={()=>run("searchWeb",{query:query.trim()})}>Search</Button></div><Button variant="outline" className="w-full" disabled={busy} onClick={()=>run("listApps")}>Discover installed apps</Button></section>

        <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-white/50">Universal UI control</h3><Button variant="outline" className="w-full" disabled={busy} onClick={()=>run("observe")}>Inspect screen + UI tree</Button><div className="flex gap-2"><Input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Visible text / content description"/><Button disabled={busy||!target.trim()} onClick={()=>run("tapText",{text:target.trim()})}>Tap</Button></div><div className="flex gap-2"><Input value={text} onChange={e=>setText(e.target.value)} placeholder="Ordinary text to type"/><Button disabled={busy||!text} onClick={()=>run("typeText",{text})}>Type</Button></div><div className="grid grid-cols-4 gap-2">{["up","down","left","right"].map(d=><Button key={d} variant="outline" disabled={busy} onClick={()=>run("scroll",{direction:d})}>{d}</Button>)}</div><div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={()=>run("globalAction",{actionName:"home"})}>Home</Button><Button variant="outline" onClick={()=>run("globalAction",{actionName:"back"})}>Back</Button><Button variant="outline" onClick={()=>run("globalAction",{actionName:"recents"})}>Recents</Button></div></section>

        <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-white/50">Shared storage</h3><div className="flex gap-2"><Input value={path} onChange={e=>setPath(e.target.value)} placeholder="/storage/emulated/0"/><Button disabled={busy||!path} onClick={()=>run("listDirectory",{path})}>List</Button></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy||!path} onClick={()=>run("readFile",{path})}>Read file</Button><Button variant="outline" disabled={busy||!path} onClick={()=>run("getFileInfo",{path})}>File info</Button><Button variant="outline" disabled={busy||!path} onClick={()=>run("createDirectory",{path})}>Create folder</Button><Button variant="outline" disabled={busy||!path} onClick={()=>{if(window.confirm(`Delete ${path}? This cannot be undone.`)) void run("deleteFile",{path,confirm:true});}}>Delete path</Button></div><Input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Destination path"/><div className="grid grid-cols-3 gap-2"><Button variant="outline" disabled={busy||!path||!destination} onClick={()=>{if(window.confirm(`Rename or move ${path} to ${destination}?`)) void run("renameFile",{path,destination,confirm:true});}}>Rename</Button><Button variant="outline" disabled={busy||!path||!destination} onClick={()=>{if(window.confirm(`Move ${path} to ${destination}?`)) void run("moveFile",{source:path,destination,confirm:true});}}>Move</Button><Button variant="outline" disabled={busy||!path||!destination} onClick={()=>{if(window.confirm(`Copy ${path} to ${destination}?`)) void run("copyFile",{source:path,destination,confirm:true});}}>Copy</Button></div><Textarea value={fileContent} onChange={e=>setFileContent(e.target.value)} placeholder="UTF-8 text content to write" className="min-h-24 font-mono text-xs"/><Button variant="outline" className="w-full" disabled={busy||!path} onClick={()=>{if(window.confirm(`Write UTF-8 text to ${path}? Existing files will be replaced.`)) void run("writeFile",{path,content:fileContent,confirm:true});}}>Write file</Button></section>

        <section><h3 className="text-xs uppercase tracking-wider text-white/50 mb-2">Agent result</h3><pre className="max-h-72 overflow-auto rounded-lg bg-black/30 border border-white/10 p-3 text-[10px] text-white/65 whitespace-pre-wrap">{pretty||"No result yet."}</pre></section>
      </div></ScrollArea>
    </aside>}
  </>;
}
