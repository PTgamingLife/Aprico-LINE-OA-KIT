import {decodeMenuImage, safeTrialExternal, trialAreas, TRIAL_SIZE} from '../../../src/trial-model.ts';
import {trialLine} from './trial-line.ts';
import type {apiClient} from './deploy-engine.ts';

type Call=ReturnType<typeof apiClient>;
type Size='tall'|'full';
export function liffSizes(design:any):Size[]{
 if(design.secretary?.direction==='records')return [];
 return [...new Set<Size>(design.cells.slice(0,design.grid).flatMap((cell:any)=>cell.action==='half'?['tall']:cell.action==='full'?['full']:[]))];
}
export async function defaultMenu(call:Call){
 const current=await call('line','/v2/bot/user/all/richmenu','GET',undefined,true);
 if(current===null)return null;
 if(!/^richmenu-[a-f\d]{32}$/.test(current?.richMenuId||''))throw Error('line_menu_status_invalid');
 return current.richMenuId as string;
}
export async function configureLiff(design:any,target:any,connect:()=>Promise<Call>){
 const sizes=liffSizes(design), ids:Partial<Record<Size,string>>={};
 if(!sizes.length)return ids;
 const call=await connect(), result=await call('line','/liff/v1/apps','GET',undefined,true)??{apps:[]};
 if(!Array.isArray(result.apps))throw Error('line_liff_list_invalid');
 for(const size of sizes){
  const description=target.slug+'-'+size, url=target.appUrl+'liff-'+size+'.html';
  const existing=result.apps.find((app:any)=>app.description===description&&app.view?.url===url&&app.view?.type===size);
  const app=existing??await call('line','/liff/v1/apps','POST',{view:{type:size,url},description,scope:['openid']});
  if(typeof app.liffId!=='string'||!new RegExp('^'+target.loginId+'-[A-Za-z0-9]+$').test(app.liffId))throw Error('line_liff_id_invalid');
  ids[size]=app.liffId;
 }
 return ids;
}
export async function prepareMenu(design:any,target:any,liff:Partial<Record<Size,string>>,image:string|undefined,call:Call,token:string,fetcher:typeof fetch){
 const bytes=decodeMenuImage(image);
 const areas=trialAreas(design,true).map(({cell,index,bounds})=>{
  const label=Array.from(cell.label.trim()||'功能 '+(index+1)).slice(0,20).join('');
  if(cell.action==='message')return {bounds,action:{type:'message',label,text:cell.label}};
  const id=cell.action==='half'?liff.tall:cell.action==='full'?liff.full:null;
  const uri=cell.action==='web'?safeTrialExternal(cell.content):id?'https://liff.line.me/'+id+'?apricoCell='+(index+1):'';
  if(!uri||uri.length>1000)throw Error('line_menu_invalid_destination');
  return {bounds,action:{type:'uri',label,uri}};
 });
 if(await defaultMenu(call)!==target.previousMenuId)throw Error('existing_menu_requires_review');
 const {richMenuId:id}=await call('line','/v2/bot/richmenu','POST',{size:{width:TRIAL_SIZE.width,height:TRIAL_SIZE.height},selected:true,name:target.slug,chatBarText:'開啟服務選單',areas});
 if(!/^richmenu-[a-f\d]{32}$/.test(id||''))throw Error('line_menu_id_invalid');
 const upload=trialLine(token,fetcher);
 try{
  await upload('/v2/bot/richmenu/'+id+'/content','POST',bytes,image!.startsWith('data:image/jpeg;')?'image/jpeg':true);
  if(await defaultMenu(call)!==target.previousMenuId)throw Error('existing_menu_requires_review');
 }catch(e){
  await call('line','/v2/bot/richmenu/'+id,'DELETE').catch(()=>{});
  throw e;
 }
 return id as string;
}

export async function pagesReleaseLive(record:any,fetcher:typeof fetch=fetch){
 const t=record.target;
 if(!t||!/^aprico-[a-f0-9]{32}$/.test(t.branch)||!/^[-a-z\d]+$/i.test(t.owner)||!/^[-\w.]+$/.test(t.repo)||['.','..'].includes(t.repo))return false;
 const url='https://'+t.owner.toLowerCase()+'.github.io/'+t.repo+'/aprico-release.json';
 try{
  const r=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!r.ok)return false;
  const reader=r.body?.getReader();if(!reader)return false;
  const result=await reader.read();await reader.cancel();
  if(!result.value||result.value.length>256)return false;
  return JSON.parse(new TextDecoder().decode(result.value)).release===t.branch;
 }catch{return false;}
}

export function liffPage(html:string,id:string){
 const scripts='<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>window.liff?.init({liffId:'+JSON.stringify(id)+'}).catch(()=>{});</script>';
 return /<\/head\s*>/i.test(html)?html.replace(/<\/head\s*>/i,()=>scripts+'</head>'):html.replace(/^\s*(?:<!doctype\s+html[^>]*>)?/i,start=>start+scripts);
}

export function publishPagesWorkflow(branch:string){
 if(!/^aprico-[a-f0-9]{32}$/.test(branch))throw Error('invalid_pages_branch');
 return `name: Publish Aprico site
on:
  push:
    branches: [${branch}]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: aprico-pages
  cancel-in-progress: false
jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - name: Prepare reviewed static files
        run: |
          mkdir published
          cp index.html .nojekyll aprico-release.json published/
          for file in style.css app.js liff-tall.html liff-full.html; do
            if [ -f "$file" ]; then cp "$file" published/; fi
          done
      - uses: actions/upload-pages-artifact@v3
        with:
          path: published
      - uses: actions/deploy-pages@v4
`;
}
