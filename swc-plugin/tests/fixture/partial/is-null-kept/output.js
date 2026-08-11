import { isBuildConditions } from 'build-conditions';
export const isDesktop = isBuildConditions('desktop');
export const isClient = true;
export const both = isBuildConditions(['desktop', 'client']);
