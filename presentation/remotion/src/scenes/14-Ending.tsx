import {useCurrentFrame} from 'remotion';
import {Check, Link2} from 'lucide-react';
import {Accent, At, Badge, Bot, C, Flow, Headline, Label, Maya, Pop, Sparkles, Stage, Token, tween} from '../design';

export const Ending = () => {
  const f = useCurrentFrame();
  return <Stage light chapter="14 / FROM ANSWER TO EVIDENCE" note="Working local prototype · original motion graphics · actual screenshots · synthesized narration · no automatic submission.">
    <Headline dark={false} size={98}>Now the handoff has <Accent color="#AA492F">proof.</Accent></Headline>
    <At x={105} y={315}><Maya happy size={385} /></At>
    <At x={596} y={507}><Bot size={206} /></At>
    <Flow d="M692 451C953 341 1159 455 1650 450" progress={tween(f, 4, 62)} color={C.green} />
    <At x={776 + tween(f, 9, 66, 0, 728)} y={386} style={{rotate: `${tween(f, 9, 66, -22, 8)}deg`}}><Token version="B" size={137} /></At>
    <Pop x={906} y={543} delay={45}>
      <div style={{fontWeight: 700, fontSize: 79, letterSpacing: -3, lineHeight: 1.06}}>Agent Flight Recorder</div>
      <div style={{fontSize: 41, fontFamily: 'Story Serif', fontStyle: 'italic', marginTop: 14, color: '#AA492F'}}>with Evidence Lens.</div>
    </Pop>
    <Pop x={809} y={753} delay={88}><div style={{display: 'flex', gap: 18}}>
      <Badge color={C.ink} dark={false} size={25}><Link2 size={27} />Follow the run</Badge>
      <Badge color={C.teal} size={25}><Check size={27} />Question the claim</Badge>
    </div></Pop>
    <At x={152} y={820}><Label color={C.gray} size={23}>Developers · reviewers · on-call teams</Label></At>
    <Sparkles x={1556} y={446} start={66} color={C.green} amount={10} />
  </Stage>;
};
