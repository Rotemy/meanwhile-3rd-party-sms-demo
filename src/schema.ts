export interface Payload {
  age: number;
  gender: string;
  smoking: boolean;
  country: string;
  coverage_btc: number;
}

export function validatePayload(o: any): { ok: true; value: Payload } | { ok: false; error: string } {
  if (o == null || typeof o !== "object") return { ok: false, error: "payload must be an object" };
  const age = (o as any).age;
  const gender = (o as any).gender;
  const smoking = (o as any).smoking;
  const country = (o as any).country;
  const coverage_btc = (o as any).coverage_btc;
  
  if (typeof age !== "number" || age < 0) return { ok: false, error: "age must be a valid number" };
  if (!gender || typeof gender !== "string" || gender.trim().length === 0) return { ok: false, error: "gender is required" };
  if (typeof smoking !== "boolean") return { ok: false, error: "smoking must be a boolean" };
  if (!country || typeof country !== "string" || country.trim().length === 0) return { ok: false, error: "country is required" };
  if (typeof coverage_btc !== "number" || coverage_btc < 0) return { ok: false, error: "coverage_btc must be a valid number" };
  
  return { 
    ok: true, 
    value: { 
      age, 
      gender: gender.trim(), 
      smoking, 
      country: country.trim(), 
      coverage_btc 
    } 
  };
}


