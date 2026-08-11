import { switchBuildCondition } from 'build-conditions';
import { desktop } from './impl@desktop';
import { mobile } from './impl@mobile';
export const impl = switchBuildCondition({ desktop, mobile });
