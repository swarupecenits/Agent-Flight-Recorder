import {useCurrentFrame} from 'remotion';
import {Check, LockKeyhole, Mail, ShieldCheck, X} from 'lucide-react';
import {Accent, At, Badge, C, Cursor, Flow, Headline, Label, Panel, Pop, ProofShot, Stage, tween} from '../design';

export const Approval = () => {
  const f = useCurrentFrame();
  const approved = f > 126;
  return <Stage chapter="05 / A HUMAN AT THE BOUNDARY" note="Local demo policy only: no cloud permission changes, enterprise-wide enforcement, or real email delivery.">
    <Headline size={101}>Not every action<br />gets a <Accent>green light.</Accent></Headline>
    <Flow d="M130 575H1720" progress={tween(f, 5, 55)} color="#50696B" />
    <At x={210} y={447} style={{opacity: 1 - tween(f, 71, 90)}}><Badge color={C.red} size={36}><LockKeyhole size={34} />Restricted read</Badge></At>
    <At x={615} y={465}><div style={{width: 91, height: 240, background: `repeating-linear-gradient(45deg,${C.coral},${C.coral} 18px,${C.ink} 18px,${C.ink} 36px)`, borderRadius: 15}} /></At>
    <Pop x={469} y={431} delay={40}><Badge color={C.red} size={36}><X size={30} />BLOCK</Badge></Pop>
    <At x={783} y={461}><Panel w={612} h={293}>
      <At x={31} y={26}><Label color={C.orange}>EXACT ACTION / HUMAN REVIEW</Label></At>
      <At x={32} y={90}><div style={{fontSize: 37, display: 'flex', gap: 18}}><Mail size={44} />External-recipient action</div></At>
      <At x={39} y={186}><Badge color={approved ? C.teal : C.orange} size={33}>{approved ? <Check size={34} /> : <ShieldCheck size={34} />}{approved ? 'APPROVED' : 'REVIEW & APPROVE'}</Badge></At>
    </Panel></At>
    <Cursor x={tween(f, 91, 125, 1480, 1150)} y={tween(f, 91, 125, 810, 670)} click={f > 125 && f < 155} />
    <At x={1412 + tween(f, 137, 188, 0, 125)} y={517} style={{opacity: tween(f, 137, 150)}}>
      <div style={{width: 156, height: 179, background: C.cream, color: C.ink, borderRadius: '9px 9px 18px 18px', padding: 18, rotate: '7deg'}}>
        <Check size={40} color={C.green} /><div style={{fontSize: 24, fontWeight: 700, marginTop: 13}}>LOCAL<br />RECEIPT</div><div style={{height: 4, background: '#BECBC2', marginTop: 14}} />
      </div>
    </At>
    <ProofShot kind="policies" x={113} y={591} w={530} h={200} delay={87} focus="60% 50%" caption="POLICY REFERENCE / ACTUAL PRODUCT" />
  </Stage>;
};
