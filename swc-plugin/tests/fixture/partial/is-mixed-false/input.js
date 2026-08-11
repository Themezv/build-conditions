import { isBuildConditions } from 'build-conditions';
export const flag = isBuildConditions(['server', 'desktop']);
