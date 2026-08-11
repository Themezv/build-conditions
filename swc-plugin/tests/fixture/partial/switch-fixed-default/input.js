import { switchBuildCondition } from 'build-conditions';
import { serverImpl } from './impl@server';
import { defaultImpl } from './impl@default';
export const impl = switchBuildCondition({
    server: serverImpl,
    default: defaultImpl,
});
