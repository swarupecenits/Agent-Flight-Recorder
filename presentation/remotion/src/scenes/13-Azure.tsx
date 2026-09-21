import {useCurrentFrame} from 'remotion';
import {Check, Cloud, FileText, ShieldCheck} from 'lucide-react';
import {Accent, At, Badge, C, Cursor, Flow, Headline, Label, Panel, Pop, Stage, tween} from '../design';

export const Azure = () => {
  const f = useCurrentFrame();
  return <Stage chapter="13 / A DRAFT, NOT A VERDICT" note="Real optional Azure inference. Bounded metadata, explicit approval, measured usage, and visible failures. No hidden fallback.">
    <Headline size={101}>Let the model help.<br /><Accent>Not decide the truth.</Accent></Headline>
    <Pop x={128} y={386} delay={9}><Panel w={576} h={380}>
      <At x={31} y={27}><Label color={C.orange}>EXACT OUTGOING PREVIEW</Label></At>
      <At x={35} y={94}><div style={{fontFamily: 'Story Mono', fontSize: 29, lineHeight: 1.7}}>claim: final test passes<br />version: B / result: A<br />verdict: Unverifiable</div></At>
      <At x={39} y={281}><Badge size={30} color={f > 103 ? C.teal : C.orange}>{f > 103 ? 'APPROVED ✓' : 'APPROVE REQUEST'}</Badge></At>
    </Panel></Pop>
    <Cursor x={tween(f, 56, 101, 800, 530)} y={tween(f, 56, 101, 810, 703)} click={f > 102 && f < 133} />
    <Flow d="M740 576H1006" progress={tween(f, 103, 143)} color={C.blue} />
    <At x={1038} y={444}><Cloud size={226} strokeWidth={1.6} color={C.blue} /></At>
    <At x={1042} y={678}><Label color={C.blue}>AZURE / GPT-5.4</Label></At>
    <Flow d="M1306 575H1415" progress={tween(f, 137, 165)} color={C.blue} />
    <Pop x={1424} y={413} delay={158} rotate={4}>
      <div style={{width: 341, height: 337, background: C.cream, color: C.ink, borderRadius: 17, padding: 30}}>
        <FileText size={59} color={C.green} /><div style={{fontSize: 37, fontWeight: 700, marginTop: 18}}>Handoff<br />draft</div>
        <div style={{fontSize: 22, marginTop: 17, lineHeight: 1.3}}>Tokens · stream · time<br />Measured, not guessed</div>
      </div>
    </Pop>
    <At x={780} y={798}><div style={{display: 'flex', alignItems: 'center', gap: 13, color: C.teal, fontSize: 28, opacity: tween(f, 165, 185)}}><ShieldCheck /><Check />Evidence verdict stays unchanged</div></At>
  </Stage>;
};
