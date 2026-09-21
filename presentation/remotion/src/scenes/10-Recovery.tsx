import {useCurrentFrame} from 'remotion';
import {Check, FilePenLine, LockKeyhole} from 'lucide-react';
import {Accent, At, Badge, C, Cursor, Flow, Headline, Label, Panel, Pop, Sparkles, Stage, Token, tween} from '../design';

export const Recovery = () => {
  const f = useCurrentFrame();
  return <Stage light chapter="10 / CORRECT WITHOUT ERASING" note="Recovery executes only a compatible built-in mock checkpoint or fresh mock run. Other runtimes get a handoff.">
    <Headline dark={false} size={105}>Don't rewrite history.<br /><Accent color="#B54C32">Create better evidence.</Accent></Headline>
    <Pop x={128} y={388} delay={9}>
      <Panel w={486} h={377}><At x={28} y={27}><Label color={C.orange}>ORIGINAL / UNCHANGED</Label></At>
        <At x={32} y={91}><div style={{fontSize: 41, fontWeight: 600}}>Test A. Deliver B.</div></At>
        <At x={41} y={174}><Token status="unknown" version="B" size={137} /></At>
        <At x={213} y={225}><div style={{fontSize: 28, color: C.orange}}>Unverifiable</div></At>
        <At x={423} y={309}><LockKeyhole size={29} color={C.muted} /></At>
      </Panel>
    </Pop>
    <Flow d="M636 565C792 565 768 565 897 565" progress={tween(f, 20, 73)} color="#668275" />
    <Pop x={731} y={413} delay={35}>
      <div style={{width: 383, height: 304, background: '#FFE3C2', border: '2px solid #DCA885', borderRadius: 24, padding: 26, rotate: '-3deg'}}>
        <FilePenLine size={40} color="#974C30" /><div style={{fontSize: 35, fontWeight: 700, marginTop: 15}}>Review the plan</div>
        <div style={{fontSize: 24, marginTop: 16, lineHeight: 1.4}}>Correction · checkpoint<br />effects · limits</div>
        <div style={{marginTop: 21}}><Badge color={f > 135 ? C.teal : C.coral} size={26}>{f > 135 ? 'APPROVED ✓' : 'APPROVE NEW RUN'}</Badge></div>
      </div>
    </Pop>
    <Cursor x={tween(f, 100, 134, 1160, 1005)} y={tween(f, 100, 134, 806, 653)} click={f > 134 && f < 158} />
    <Flow d="M1123 565H1253" progress={tween(f, 140, 180)} color={C.green} />
    <Pop x={1272} y={388} delay={159}>
      <Panel w={508} h={377} light style={{borderColor: '#569C76'}}><At x={28} y={27}><Label color={C.green}>NEW / LINKED TO ORIGINAL</Label></At>
        <At x={32} y={91}><div style={{fontSize: 41, fontWeight: 600}}>Test B. Deliver B.</div></At>
        <At x={41} y={174}><Token version="B" size={137} /></At>
        <At x={214} y={225}><div style={{fontSize: 33, color: C.green, fontWeight: 700}}>Supported</div></At>
        <At x={43} y={328}><div style={{fontSize: 21, color: C.gray}}>COMPARE: BEFORE → AFTER</div></At>
      </Panel>
    </Pop>
    <Sparkles x={1500} y={575} start={178} color={C.green} />
    <Pop x={675} y={793} delay={215}><Badge size={28} color={C.teal}><Check size={29} />Fresh proof. Same audit trail.</Badge></Pop>
  </Stage>;
};
