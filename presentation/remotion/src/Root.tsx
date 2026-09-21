import "./index.css";
import {Composition, Folder} from 'remotion';
import {FlightStory} from './Composition';
import {Launch} from './scenes/01-Launch';
import {Gap} from './scenes/02-Gap';
import {Capture} from './scenes/03-Capture';
import {Replay} from './scenes/04-Replay';
import {Approval} from './scenes/05-Approval';
import {Insights} from './scenes/06-Insights';
import {Verdict} from './scenes/07-Verdict';
import {Scope} from './scenes/08-Scope';
import {Manifest} from './scenes/09-Manifest';
import {Recovery} from './scenes/10-Recovery';
import {Connect} from './scenes/11-Connect';
import {Desktop} from './scenes/12-Desktop';
import {Azure} from './scenes/13-Azure';
import {Ending} from './scenes/14-Ending';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="FlightRecorderStory" component={FlightStory} durationInFrames={3600} fps={30} width={1920} height={1080} />
      <Folder name="Editable-scenes">
        <Composition id="01-Launch" component={Launch} durationInFrames={240} fps={30} width={1920} height={1080} />
        <Composition id="02-Gap" component={Gap} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="03-Capture" component={Capture} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="04-Replay" component={Replay} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="05-Approval" component={Approval} durationInFrames={240} fps={30} width={1920} height={1080} />
        <Composition id="06-Insights" component={Insights} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="07-Verdict" component={Verdict} durationInFrames={360} fps={30} width={1920} height={1080} />
        <Composition id="08-Scope" component={Scope} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="09-Manifest" component={Manifest} durationInFrames={240} fps={30} width={1920} height={1080} />
        <Composition id="10-Recovery" component={Recovery} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="11-Connect" component={Connect} durationInFrames={240} fps={30} width={1920} height={1080} />
        <Composition id="12-Desktop" component={Desktop} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="13-Azure" component={Azure} durationInFrames={240} fps={30} width={1920} height={1080} />
        <Composition id="14-Ending" component={Ending} durationInFrames={210} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
