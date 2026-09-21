import {useCurrentFrame} from 'remotion';
import {Accent, At, Badge, C, Cursor, Headline, Label, MiniIcon, Panel, Pop, Stage, tween} from '../design';

export const Replay = () => {
  const f = useCurrentFrame();
  const cursor = f < 91 ? tween(f, 20, 84, 1668, 940) : tween(f, 128, 169, 940, 1668);
  return <Stage light chapter="04 / REWIND, DON'T RERUN" note="Play, step, seek, change speed, filter events and pause at errors or policy decisions. Playback is read-only.">
    <Headline dark={false} size={112}>Rewind the <Accent color="#B54B31">why.</Accent></Headline>
    <Pop x={120} y={309} delay={8}><Panel w={1680} h={485} light>
      <At x={31} y={26}><Label color={C.gray}>RECORDED TIMELINE</Label></At>
      <At x={34} y={88}><div style={{display: 'flex', gap: 15}}>{['All events', 'Errors', 'Policies', 'Tools', 'Models'].map((label, i) =>
        <Badge key={label} color={f > 126 && i === 2 ? C.orange : '#EAECE2'} size={25}>{label}</Badge>)}</div></At>
      <svg width="1680" height="250" style={{position: 'absolute', top: 143}}>
        <path d="M76 98H1595" stroke="#A5B6AA" strokeWidth="5" />
        {['PROMPT', 'TEST A', 'EDIT B', 'CLAIM', 'REVIEW'].map((label, i) => <g key={label} opacity={f > 128 && i < 4 ? .22 : 1}>
          <circle cx={90 + i * 365} cy="98" r="15" fill={i === 2 ? '#C55536' : '#38695F'} />
          <text x={90 + i * 365} y="51" textAnchor="middle" fill={C.gray} fontSize="26" fontFamily="Story Mono">{label}</text>
          <text x={90 + i * 365} y="153" textAnchor="middle" fill={C.gray} fontSize="21" fontFamily="Story Mono">0{i + 1}</text>
        </g>)}
      </svg>
      <At x={cursor - 128} y={222}><div style={{width: 50, height: 50, background: C.coral, borderRadius: '50%', border: `9px solid ${C.paper}`, boxShadow: '0 0 0 5px #FF79564D'}} /></At>
      <At x={43} y={370}><div style={{display: 'flex', gap: 21, alignItems: 'center'}}><MiniIcon kind="rewind" /><MiniIcon kind="play" /><Badge color={C.lime} size={26}>0 actions repeated</Badge></div></At>
      <At x={806} y={341}><Panel w={829} h={107}><At x={24} y={17}><Label size={20}>STATE AT THIS STEP</Label><div style={{fontFamily: 'Story Mono', fontSize: 29, marginTop: 10}}>{f > 163 ? 'approval: required / recipient: external' : 'code: B  /  latest passing test: A'}</div></At></Panel></At>
    </Panel></Pop>
    <Cursor x={tween(f, 94, 125, 1500, 486)} y={tween(f, 94, 125, 845, 425)} click={f > 125 && f < 148} />
  </Stage>;
};
