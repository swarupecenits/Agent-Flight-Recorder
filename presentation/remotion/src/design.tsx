import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {ArrowRight, Check, LockKeyhole, Play, RotateCcw, ShieldCheck} from 'lucide-react';

for (const [url, weight] of [['segoeui.ttf', '400'], ['seguisb.ttf', '600'], ['segoeuib.ttf', '700']]) {
  loadFont({family: 'Story Sans', url: staticFile(`fonts/${url}`), weight});
}
loadFont({family: 'Story Mono', url: staticFile('fonts/consola.ttf')});
loadFont({family: 'Story Serif', url: staticFile('fonts/georgiai.ttf'), style: 'italic'});

export const C = {
  ink: '#13242B', panel: '#20373F', paper: '#F4F0E7', cream: '#FFFCF4',
  muted: '#A9C0C4', gray: '#536A71', coral: '#FF7956', orange: '#FFAD73',
  lime: '#DCF48B', teal: '#75DFC3', blue: '#9DC9F7', red: '#F79793',
  green: '#216A56', rule: '#476067',
};
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const tween = (frame: number, from: number, to: number, a = 0, b = 1) =>
  interpolate(frame, [from, to], [a, b], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)});
export const pop = (frame: number, delay = 0) => spring({frame: frame - delay, fps: 30, config: {damping: 16, stiffness: 140, mass: 0.85}});

export const At = ({x, y, w, h, children, style}: {x: number; y: number; w?: number; h?: number; children: ReactNode; style?: CSSProperties}) =>
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, ...style}}>{children}</div>;

export const Pop = ({children, delay = 0, x = 0, y = 0, w, rotate = 0}: {
  children: ReactNode; delay?: number; x?: number; y?: number; w?: number; rotate?: number;
}) => {
  const f = useCurrentFrame();
  return <At x={x} y={y} w={w} style={{opacity: tween(f, delay, delay + 10), translate: `0 ${46 * (1 - pop(f, delay))}px`,
    scale: 0.86 + 0.14 * pop(f, delay), rotate: `${rotate * pop(f, delay)}deg`}}>{children}</At>;
};

export const Label = ({children, color = C.muted, size = 26}: {children: ReactNode; color?: string; size?: number}) =>
  <div style={{fontFamily: 'Story Mono', color, fontSize: size, letterSpacing: 2.1, textTransform: 'uppercase'}}>{children}</div>;
export const Headline = ({children, x = 112, y = 127, width = 1696, size = 104, dark = true}: {
  children: ReactNode; x?: number; y?: number; width?: number; size?: number; dark?: boolean;
}) => {
  const frame = useCurrentFrame();
  return <Interactive.Div name="Scene headline" style={{position: 'absolute', left: x, top: y, width, fontWeight: 700,
    fontSize: size, lineHeight: 1.03, letterSpacing: -4.5, color: dark ? C.cream : C.ink,
    opacity: interpolate(frame, [0, 14], [0, 1], {extrapolateRight: 'clamp', extrapolateLeft: 'clamp'}),
    translate: interpolate(frame, [0, 25], ['0px 32px', '0px 0px'], {extrapolateRight: 'clamp', extrapolateLeft: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)})}}>
    {children}
  </Interactive.Div>;
};
export const Accent = ({children, color = C.lime}: {children: ReactNode; color?: string}) => <span style={{color}}>{children}</span>;

export const Badge = ({children, color = C.lime, dark = true, size = 29}: {children: ReactNode; color?: string; dark?: boolean; size?: number}) =>
  <div style={{display: 'inline-flex', alignItems: 'center', gap: 13, padding: '13px 22px', background: color, color: dark ? C.ink : C.cream,
    borderRadius: 100, fontSize: size, lineHeight: 1.2, fontWeight: 700, boxShadow: `0 7px 0 ${C.ink}18`}}>{children}</div>;

export const Panel = ({children, w, h, light = false, color, style}: {children: ReactNode; w: number; h: number; light?: boolean; color?: string; style?: CSSProperties}) =>
  <div style={{width: w, height: h, position: 'relative', background: color ?? (light ? C.cream : C.panel), borderRadius: 27,
    border: `2px solid ${light ? '#DDDFD1' : '#496169'}`, boxShadow: '0 22px 60px #06121726', color: light ? C.ink : C.cream, ...style}}>{children}</div>;

export const Stage = ({children, light = false, chapter, note}: {children: ReactNode; light?: boolean; chapter: string; note?: string}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: light ? C.paper : C.ink, fontFamily: 'Story Sans', color: light ? C.ink : C.cream, overflow: 'hidden'}}>
    <svg width="1920" height="1080" style={{position: 'absolute'}}>
      <defs><pattern id={light ? 'dot-light' : 'dot-dark'} width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.05" fill={light ? '#BCCABD' : '#607C78'} opacity="0.17" /></pattern></defs>
      <rect width="1920" height="1080" fill={`url(#${light ? 'dot-light' : 'dot-dark'})`} />
      <circle cx={1770 + Math.sin(f / 60) * 12} cy="50" r="390" fill="none" stroke={light ? '#DADCCE' : '#29444A'} strokeWidth="1.5" />
      <circle cx="1770" cy="50" r="310" fill="none" stroke={light ? '#DADCCE' : '#29444A'} strokeWidth="1.5" />
    </svg>
    <At x={110} y={53}><div style={{display: 'flex', alignItems: 'center', gap: 15, fontSize: 24, fontWeight: 700}}><Mark size={35} color={light ? '#B84E31' : C.coral} />FLIGHT RECORDER</div></At>
    <At x={875} y={58}><Label color={light ? C.gray : C.muted} size={22}>{chapter}</Label></At>
    {children}
    {note ? <At x={112} y={875} w={1690}><div style={{fontSize: 23, lineHeight: 1.3, color: light ? C.gray : C.muted}}>{note}</div></At> : null}
  </AbsoluteFill>;
};

export const Mark = ({size = 64, color = C.coral}: {size?: number; color?: string}) =>
  <svg width={size} height={size} viewBox="0 0 80 80"><path d="M14 60L36 36L64 52L62 14" fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round" />
    {[[14, 60], [36, 36], [64, 52], [62, 14]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill={color} />)}</svg>;

export const Maya = ({happy = false, size = 520, frame: explicitFrame}: {happy?: boolean; size?: number; frame?: number}) => {
  const frame = useCurrentFrame();
  const f = explicitFrame ?? frame;
  const blink = f % 118 > 110 ? 0.12 : 1;
  return <svg width={size} height={size * 1.12} viewBox="0 0 400 448" overflow="visible">
    <ellipse cx="208" cy="430" rx="172" ry="17" fill="#07181E" opacity=".18" />
    <g transform={`translate(0 ${Math.sin(f / 28) * 2.5})`}>
      <path d="M154 212C106 201 77 254 73 348L129 375L295 364C302 296 290 235 249 216Z" fill={C.coral} />
      <path d="M166 226L194 278L228 221" fill={C.orange} />
      <path d="M152 251L139 365M254 248L267 356" stroke="#C4563B" strokeWidth="4" fill="none" />
      <path d="M144 130C126 82 147 39 202 35C254 28 285 68 273 136L259 210L134 202Z" fill="#243541" />
      <path d="M183 176L180 228Q204 246 226 219L221 170" fill="#BE785B" />
      <ellipse cx="208" cy="132" rx="63" ry="81" fill="#D99670" />
      <path d="M146 110Q141 29 211 41Q268 40 276 115Q255 111 238 72Q197 116 146 110Z" fill="#243541" />
      <ellipse cx="151" cy="142" rx="11" ry="16" fill="#D99670" />
      <ellipse cx="266" cy="141" rx="10" ry="16" fill="#D99670" />
      <g transform={`translate(0 129) scale(1 ${blink}) translate(0 -129)`}>
        <ellipse cx="183" cy="129" rx="5" ry="6" fill={C.ink} /><ellipse cx="233" cy="127" rx="5" ry="6" fill={C.ink} />
      </g>
      <path d={happy ? 'M184 163Q207 187 232 158' : 'M192 169Q207 159 224 169'} fill="none" stroke="#703D34" strokeWidth="4" strokeLinecap="round" />
      <path d="M174 113L192 110M224 108L241 113" fill="none" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M117 277Q86 332 154 352L229 349" fill="none" stroke="#D99670" strokeWidth="26" strokeLinecap="round" />
      <path d="M271 276Q302 329 254 348L224 349" fill="none" stroke="#D99670" strokeWidth="26" strokeLinecap="round" />
      <g transform={`translate(0 ${happy ? Math.sin(f / 18) * 2 : 0})`}>
        <path d="M161 283H338L314 387H139Z" fill="#446574" stroke={C.ink} strokeWidth="5" />
        <path d="M133 389H327" stroke={C.ink} strokeWidth="11" strokeLinecap="round" />
        <circle cx="243" cy="335" r="12" fill={C.lime} />
      </g>
      <path d="M142 380L132 430M289 381L305 430" stroke="#243541" strokeWidth="24" strokeLinecap="round" />
    </g>
  </svg>;
};

export const Bot = ({size = 235, mood = 'happy'}: {size?: number; mood?: 'happy' | 'think' | 'alert'}) => {
  const f = useCurrentFrame();
  const eye = f % 131 > 122 ? 3 : 18;
  return <svg width={size} height={size * 1.04} viewBox="0 0 260 270" overflow="visible">
    <ellipse cx="130" cy="252" rx="70" ry="10" fill="#000" opacity=".12" />
    <g transform={`translate(0 ${Math.sin(f / 16) * 9}) rotate(${Math.sin(f / 35) * 3} 130 125)`}>
      <path d="M130 60V28" stroke={C.coral} strokeWidth="8" /><circle cx="130" cy="24" r="12" fill={C.coral} />
      <rect x="44" y="64" width="172" height="143" rx="39" fill={C.lime} stroke={C.ink} strokeWidth="6" />
      <rect x="65" y="92" width="130" height="72" rx="21" fill={C.ink} />
      <rect x="90" y={121 - eye / 2} width="16" height={eye} rx="7" fill={C.teal} />
      <rect x="154" y={121 - eye / 2} width="16" height={eye} rx="7" fill={C.teal} />
      <path d={mood === 'happy' ? 'M112 141Q130 154 147 141' : mood === 'alert' ? 'M125 145L138 145' : 'M116 145L145 140'} fill="none" stroke={C.teal} strokeWidth="4" strokeLinecap="round" />
      <path d="M42 129L20 149M218 129L237 111" stroke={C.lime} strokeWidth="17" strokeLinecap="round" />
      <path d="M94 212L88 233M165 211L174 232" stroke={C.lime} strokeWidth="14" strokeLinecap="round" />
      <rect x="108" y="179" width="45" height="8" rx="4" fill={C.ink} opacity=".35" />
    </g>
  </svg>;
};

export const Token = ({version = 'A', status = 'pass', size = 170}: {version?: string; status?: 'pass' | 'unknown' | 'fail'; size?: number}) => {
  const color = status === 'pass' ? C.lime : status === 'fail' ? C.red : C.orange;
  return <div style={{width: size, height: size, borderRadius: '50%', background: color, color: C.ink, border: `7px solid ${C.ink}`,
    boxShadow: `0 10px 0 ${C.ink}35, inset 0 0 0 8px #ffffff33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
    {status === 'pass' ? <Check size={size * .32} strokeWidth={4} /> : <div style={{fontSize: size * .35, fontWeight: 700, lineHeight: 1}}>{status === 'fail' ? '×' : '?'}</div>}
    <div style={{fontFamily: 'Story Mono', fontSize: size * .22, fontWeight: 700, marginTop: 6}}>VER. {version}</div>
  </div>;
};

export const Flow = ({d, progress = 1, color = C.teal, dash = false, width = 5}: {
  d: string; progress?: number; color?: string; dash?: boolean; width?: number;
}) => <svg width="1920" height="1080" style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
  <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
    strokeDasharray={dash ? '.008 .012' : 1} strokeDashoffset={dash ? -progress : 1 - clamp(progress)} />
</svg>;

export const ProofShot = ({kind, x, y, w = 510, h = 260, focus = 'center', delay = 20, caption = 'ACTUAL PROTOTYPE'}: {
  kind: 'recordings' | 'policies' | 'insights' | 'manifest' | 'connect'; x: number; y: number; w?: number; h?: number; focus?: string; delay?: number; caption?: string;
}) => {
  const f = useCurrentFrame();
  return <At x={x} y={y} w={w} style={{opacity: tween(f, delay, delay + 16), scale: .95 + .05 * pop(f, delay), rotate: '-1deg'}}>
    <div style={{border: `2px solid ${C.rule}`, borderRadius: 17, overflow: 'hidden', background: C.cream, boxShadow: '0 14px 32px #091C2940'}}>
      <div style={{height: 33, padding: '5px 12px', fontFamily: 'Story Mono', color: C.gray, fontSize: 17, letterSpacing: 1.5}}>{caption}</div>
      <CanvasImage src={staticFile(`screenshots/${kind}.png`)} style={{width: w - 4, height: h, objectFit: 'cover', objectPosition: focus, display: 'block'}} />
    </div>
  </At>;
};

export const Cursor = ({x, y, click = false}: {x: number; y: number; click?: boolean}) => {
  const f = useCurrentFrame();
  return <At x={x} y={y} style={{zIndex: 5}}>
    {click ? <div style={{position: 'absolute', width: 82, height: 82, top: -30, left: -30, border: `4px solid ${C.coral}`, borderRadius: '50%', opacity: .6,
      scale: 0.5 + ((f % 26) / 26) * .8}} /> : null}
    <svg width="48" height="61" viewBox="0 0 48 61"><path d="M5 4L5 48L17 37L27 56L37 51L28 32L44 31Z" fill={C.cream} stroke={C.ink} strokeWidth="3" /></svg>
  </At>;
};

export const Sparkles = ({x, y, amount = 9, start = 0, color = C.lime}: {x: number; y: number; amount?: number; start?: number; color?: string}) => {
  const f = useCurrentFrame();
  const p = clamp((f - start) / 38);
  return <>{Array.from({length: amount}, (_, i) => {
    const angle = i * Math.PI * 2 / amount;
    return <At key={i} x={x + Math.cos(angle) * p * 270} y={y + Math.sin(angle) * p * 200}
      style={{opacity: Math.sin(p * Math.PI), rotate: `${i * 36 + p * 100}deg`}}>
      <div style={{width: 14, height: 32, background: color, borderRadius: 4}} /></At>;
  })}</>;
};

export const MiniIcon = ({kind, size = 38}: {kind: string; size?: number}) => kind === 'lock' ? <LockKeyhole size={size} />
  : kind === 'play' ? <Play size={size} /> : kind === 'rewind' ? <RotateCcw size={size} />
  : kind === 'shield' ? <ShieldCheck size={size} /> : <ArrowRight size={size} />;
