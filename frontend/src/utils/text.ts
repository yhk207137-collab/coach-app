// Hebrew keyboards and copy-paste insert invisible direction marks that make browsers reject emails.
export const cleanEmail = (v: string) => v.replace(/[​-‏‪-‮⁦-⁩﻿\s]/g, '');

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
