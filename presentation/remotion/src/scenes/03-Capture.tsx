import {useCurrentFrame} from 'remotion';
import {Accent, At, Badge, C, Flow, Headline, Label, Mark, Panel, Pop, ProofShot, Stage, tween} from '../design';

export const Capture = () => {
  const f = useCurrentFrame();
  const items = ['PROMPT', 'MODEL', 'TOOL', 'DECISION', 'OUTPUT', 'ERROR', 'RETRY'];
  return <Stage chapter="03 / FOLLOW THE RUN" note="Records observable events and explicit annotations, not hidden reasoning. SQLite persists original recordings.">
    <Headline size={106}>Give the agent<br />a <Accent>flight recorder.</Accent></Headline>
    <At x={874} y={358} style={{zIndex: 2}}><Panel w={554} h={362}>
      <At x={227} y={59}><Mark size={98} /></At>
      <At x={42} y={181} w={470}><div style={{fontWeight: 700, fontSize: 51, textAlign: 'center'}}>THE BLACK BOX</div></At>
      <At x={64} y={270}><Badge size={26} color={C.teal}>CAPTURE · ORDER · PRESERVE</Badge></At>
    </Panel></At>
    {items.map((label, index) => {
      const p = tween(f, 10 + index * 12, 77 + index * 12);
      const originY = 345 + index * 65;
      return <At key={label} x={120 + p * 745} y={originY + (516 - originY) * p} style={{opacity: 1 - tween(f, 69 + index * 12, 91 + index * 12), rotate: `${Math.sin(p * Math.PI) * (index % 2 ? 9 : -9)}deg`}}>
        <Badge color={index === 5 ? C.red : index === 6 ? C.orange : C.cream} size={27}>{label}</Badge>
      </At>;
    })}
    <Flow d="M1435 540C1638 540 1660 540 1790 540" progress={tween(f, 75, 130)} />
    <At x={1510} y={437}><Label>ORDERED TRACE</Label></At>
    {Array.from({length: 5}, (_, i) => <At key={i} x={1495 + i * 52} y={528 + Math.sin((f - i * 12) / 22) * 3}
      style={{opacity: tween(f, 78 + i * 14, 90 + i * 14)}}><div style={{width: 28, height: 28, background: i === 3 ? C.coral : C.teal, borderRadius: 8}} /></At>)}
    <ProofShot kind="recordings" x={119} y={464} w={618} h={315} delay={135} caption="YOUR RUNS / ACTUAL PRODUCT" focus="center 54%" />
    <Pop x={875} y={755} delay={148}><div style={{fontSize: 40, fontWeight: 600}}>Every run has a story.</div></Pop>
  </Stage>;
};
