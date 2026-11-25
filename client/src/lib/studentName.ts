export function displayStudentName(fullName: string, maxWords = 5): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}…`;
}
