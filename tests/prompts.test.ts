import {expect,it} from 'vitest';
import {contractExamples,contracts} from '../src/prompt-contracts';
import {parseContest} from '../src/contest-schema';
import {parseDeck} from '../src/flashcards';
import {importQuestions} from '../src/questions';
import {buildPrompt,templates,type Context} from '../src/prompts';
const context:Context={contest:'Concurso fictício',board:'Banca fictícia',role:'Cargo',discipline:'Disciplina',topic:'Assunto',topicId:'UUID_DO_ASSUNTO',author:'Autor',work:'Obra',quantity:5,difficulty:'Média',existing:'{"id":"id-estavel"}',performance:'{"questoes":10,"acertos":7}'};
it('usa exemplos reais dos contratos que passam pelos três importadores',()=>{
 expect(parseContest(JSON.stringify(contractExamples.contest)).type).toBe('contest');
 expect(parseDeck(JSON.stringify(contractExamples.cards)).cards).toHaveLength(1);
 expect(importQuestions(JSON.stringify(contractExamples.questions),new Set([context.topicId]),[])[0].question.source).toBe('ai_generated');
});
it('inclui identificadores, contratos e dados mínimos somente nos prompts correspondentes',()=>{
 expect(templates).toHaveLength(13);
 for(const target of ['contest','cards','questions'] as const){const template=templates.find(t=>t.target===target)!;const text=buildPrompt(template,context);expect(text).toContain(contracts[target]);expect(text).toContain('UUID_DO_ASSUNTO');}
 expect(buildPrompt(templates.find(t=>t.id==='retificacao')!,context)).toContain('id-estavel');
 expect(buildPrompt(templates.find(t=>t.id==='desempenho')!,context)).toContain('"acertos":7');
 expect(buildPrompt(templates.find(t=>t.id==='videos')!,context)).not.toContain('"acertos":7');
});

it("gera prompt importável de Trilhas com UUIDs e sem inventar incidência",()=>{
 const text=buildPrompt(templates.find(t=>t.id==="trilhas")!,{...context,trailContest:"concurso-uuid",trailTopics:[{topic_id:"assunto-uuid",name:"Base",parent_id:null}]});
 expect(text).toContain("study_trail");
 expect(text).toContain("assunto-uuid");
 expect(text).toContain("concurso-uuid");
 expect(text).toContain("Não estime probabilidade da próxima prova");
});
