import { verifyRefreshToken, generateAccessToken } from './auth.service';

type RefreshInput = {
  refreshToken: string;
};

export const refreshAccessToken = (input: RefreshInput) => {
  const payload = verifyRefreshToken(input.refreshToken);

  return {
    accessToken: generateAccessToken({
      userId: payload.userId,
      organizationId: payload.organizationId,
    }),
  };
};