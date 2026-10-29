import {advanceLearning} from '../../../src/learning/model.ts';
export async function learningAction(b:any,db:any,subject:string,response:(v:unknown,status?:number)=>Response){
 const columns='course_id,completed_count,quiz_score,passed,revision,updated_at';
 const {data:rows,error}=await db.from('line_oa_kit_learning_progress').select(columns).eq('line_subject',subject);
 if(error)return response({error:'讀取學習紀錄失敗，請稍後重試'},503);
 if(b.action==='learning_list')return response({progress:rows});
 let next;try{next=advanceLearning(b,rows);}catch(e){return response({error:(e as Error).message},409);}
 const record={...next,line_subject:subject,updated_at:new Date().toISOString()};
 const query=next.revision===1?db.from('line_oa_kit_learning_progress').insert(record):db.from('line_oa_kit_learning_progress').update(record).eq('line_subject',subject).eq('course_id',next.course_id).eq('revision',next.revision-1);
 const {data:saved,error:saveError}=await query.select(columns).maybeSingle();
 if(saveError||!saved)return response({error:'紀錄未保存或已在其他頁面更新，請重新載入後再試'},409);
 return response({progress:saved});
}
