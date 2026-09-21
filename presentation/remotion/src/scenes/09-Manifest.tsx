import {useCurrentFrame} from 'remotion';
import {ArrowRight, Check, FileCheck2, Link2} from 'lucide-react';
import {Accent, At, C, Headline, Label, Panel, Pop, ProofShot, Stage, tween} from '../design';

export const Manifest = () => {
  const f = useCurrentFrame();
  return <Stage chapter="09 / GIVE THE NEXT PERSON CONTEXT" note="Available is not the same as used. Missing versions, links, and captured activity remain visible.">
    <Headline size={99}>What was there?<br /><Accent>What was actually used?</Accent></Headline>
    <Pop x={114} y={365} delay={9}><Panel w={935} h={408}>
      <At x={28} y={27}><Label>RUN MANIFEST</Label></At>
      <At x={409} y={27}><Label size={23}>AVAILABLE</Label></At>
      <At x={666} y={27}><Label size={23}>ACTUALLY USED</Label></At>
      {['Agent', 'Test harness', 'Instructions', 'Health tool'].map((label, i) => <At key={label} x={30} y={95 + i * 69} w={870}>
        <div style={{fontSize: 32, borderTop: '1px solid #41616A', paddingTop: 14}}>{label}</div>
        <At x={454} y={17}><Check size={30} color={C.muted} /></At>
        <At x={675} y={15} style={{opacity: tween(f, 25 + i * 17, 39 + i * 17)}}><div style={{fontSize: 26, color: i < 2 ? C.teal : C.muted}}>{i < 2 ? '↗ linked step' : 'not captured'}</div></At>
      </At>)}
    </Panel></Pop>
    <At x={1080} y={526}><ArrowRight size={74} color={C.teal} /></At>
    <Pop x={1221} y={351} delay={66} rotate={4}>
      <div style={{width: 507, height: 461, borderRadius: 16, background: C.cream, color: C.ink, padding: 35, boxShadow: '0 18px 35px #0004'}}>
        <FileCheck2 size={59} color={C.green} />
        <div style={{fontSize: 46, fontWeight: 700, marginTop: 21}}>The handoff</div>
        {['What holds up', 'What needs a check', 'Linked source steps'].map((label, i) => <div key={label} style={{fontSize: 30, marginTop: 27, display: 'flex', gap: 12}}><Link2 color={i ? '#A85535' : C.green} size={27} />{label}</div>)}
      </div>
    </Pop>
    <ProofShot kind="manifest" x={119} y={597} w={533} h={212} delay={125} focus="67% 94%" caption="THE MANIFEST / ACTUAL PRODUCT" />
  </Stage>;
};
