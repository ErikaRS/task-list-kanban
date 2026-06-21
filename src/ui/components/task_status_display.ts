export function shouldRenderStatusAsText(status: string): boolean {
	return status.length > 1 || /\p{Extended_Pictographic}/u.test(status);
}
