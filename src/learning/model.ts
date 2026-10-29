import {lessonUnits,questions} from './course-data.ts';
import {claudeCodeUnits,claudeCodeQuestions} from './claude-code-data.ts';
import {claudeApiUnits,claudeApiQuestions} from './claude-api-data.ts';
export const courses=[
 {id:'claude-01',title:'認識 Claude：從新同事到工作夥伴',units:lessonUnits,questions},
 {id:'claude-code',title:'Claude Code：把 AI 變成行動代理人',units:claudeCodeUnits,questions:claudeCodeQuestions},
 {id:'claude-api',title:'Claude API：從基礎呼叫到受控代理人',units:claudeApiUnits,questions:claudeApiQuestions}
] as const;
export type Progress={course_id:string;completed_count:number;quiz_score:number;passed:boolean;revision:number;updated_at?:string};
export const emptyProgress=(id:string):Progress=>({course_id:id,completed_count:0,quiz_score:0,passed:false,revision:0});
export function advanceLearning(b:any,rows:Progress[]):Progress{
 const index=courses.findIndex(c=>c.id===b.courseId),course=courses[index];
 if(!course)throw Error('課程不存在');
 if(index>0&&!rows.find(r=>r.course_id===courses[index-1].id)?.passed)throw Error('請先通過上一堂課');
 const old=rows.find(r=>r.course_id===course.id)||emptyProgress(course.id);
 if(!Number.isSafeInteger(b.revision)||b.revision!==old.revision)throw Error('紀錄已更新，請重新載入');
 const next={...old,revision:old.revision+1};
 if(b.action==='learning_complete'){
  if(!Number.isSafeInteger(b.unitIndex)||b.unitIndex<0||b.unitIndex>=course.units.length||b.unitIndex>old.completed_count)throw Error('請依順序完成單元');
  next.completed_count=Math.max(old.completed_count,b.unitIndex+1);
 }else if(b.action==='learning_quiz'){
  if(old.completed_count!==course.units.length)throw Error('請先完成所有單元');
  if(!Array.isArray(b.answers)||b.answers.length!==course.questions.length||b.answers.some((v:number,i:number)=>!Number.isInteger(v)||v<0||v>=course.questions[i].a.length))throw Error('請完成所有題目');
  const score=course.questions.reduce((s,q,i)=>s+Number(q.ok===b.answers[i]),0);
  next.quiz_score=Math.max(old.quiz_score,score);next.passed=old.passed||score>=6;
 }else throw Error('不支援的操作');
 return next;
}
