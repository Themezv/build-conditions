import { switchBuildCondition } from 'build-conditions';
import DesktopPage from './Page@desktop';
import MobilePage from './Page@mobile';
const stub = () => null;
export default switchBuildCondition({
    desktop: DesktopPage,
    mobile: MobilePage,
});
