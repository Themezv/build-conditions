import { switchBuildCondition } from 'build-conditions';
import { a } from './a';
import { b } from './b';
export const x = switchBuildCondition({ desktop: a, server: b });
