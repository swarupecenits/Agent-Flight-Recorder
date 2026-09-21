import {useCurrentFrame} from 'remotion';
import {Check, CircleHelp, Link2Off, X} from 'lucide-react';
import {Accent, At, Badge, C, Headline, Label, Panel, Pop, Stage, Token, tween} from '../design';

export const Verdict = () => {
  const f = useCurrentFrame();
  const verdicts = [
    {label: 'Supported', sub: 'The linked proof applies.', color: C.lime, Icon: Check},
    {label: 'Contradicted', sub: 'The result disagrees.', color: C.red, Icon: X},
    {label: 'Unsupported', sub: 'A proof link is missing.', color: C.blue, Icon: Link2Off},
    {label: 'Unverifiable', sub: 'Not proven for this version.', color: C.orange, Icon: CircleHelp},
  ];
  const focus = f > 217;
  return <Stage chapter="07 / EVIDENCE LENS" note="The checker evaluates explicit, version- and scope-bound claims. It does not fact-check arbitrary prose.">
    <Headline size={108}>A confident claim meets<br /><Accent>four honest answers.</Accent></Headline>
    <At x={116} y={360}><Label size={25}>CLAIM + LINKED RESULT + VERSION + TARGET</Label></At>
    <At x={118} y={403}><Label size={20}>TESTS · ACTIONS · HEALTH · EXACT QUOTATIONS</Label></At>
    {verdicts.map(({label, sub, color, Icon}, index) => {
      const active = f > 125 + index * 25 && f < 155 + index * 25;
      return <At key={label} x={116 + index * 425} y={459} style={{opacity: tween(f, 17 + index * 13, 37 + index * 13),
        scale: active ? 1.055 : 1, translate: `0 ${tween(f, 17 + index * 13, 45 + index * 13, 80, 0)}px`}}>
        <Panel w={397} h={263} style={{borderColor: active || (index === 3 && focus) ? color : '#48646A', borderWidth: active ? 4 : 2}}>
          <At x={27} y={23}><Icon size={44} color={color} /></At>
          <At x={26} y={96}><div style={{fontSize: 38, fontWeight: 700, color}}>{label}</div></At>
          <At x={26} y={165} w={341}><div style={{fontSize: 28, lineHeight: 1.25, color: C.muted}}>{sub}</div></At>
        </Panel>
      </At>;
    })}
    <Pop x={280} y={752} delay={214}><Badge color={C.orange} size={34}>MAYA'S CASE: TEST A ≠ FINAL B</Badge></Pop>
    <At x={1230} y={733} style={{opacity: tween(f, 224, 245), rotate: `${tween(f, 224, 265, -20, 6)}deg`}}><Token version="B" status="unknown" size={126} /></At>
    <At x={1380} y={755} style={{opacity: tween(f, 236, 256)}}><div style={{fontSize: 27, color: C.muted}}>Not proven.<br />Not declared broken.</div></At>
  </Stage>;
};
