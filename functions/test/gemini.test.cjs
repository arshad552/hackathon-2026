const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGeminiRequest,
  MAX_PROJECT_LENGTH,
  parseGeminiRecommendations,
  validateProjectDescription,
} = require("../src/gemini.cjs");

const equipment = [
  { id: "jetson", name: "Jetson Nano", dept: "AI", category: "AI Computing", location: "Lab A", description: "Edge AI and vision", specs: ["CUDA"], keywords: ["computer vision"] },
  { id: "gpu", name: "GPU Workstation", dept: "AI", category: "AI Computing", location: "Lab B", description: "Model training", specs: ["24 GB VRAM"], keywords: ["deep learning"] },
  { id: "scope", name: "Oscilloscope", dept: "Electronics", category: "Measurement", location: "Lab C", description: "Circuit testing", specs: [], keywords: ["electronics"] },
  { id: "pi", name: "Raspberry Pi", dept: "CS", category: "IoT", location: "Lab D", description: "Connected sensors", specs: [], keywords: ["iot"] },
];

test("validates and trims bounded project descriptions", () => {
  assert.equal(validateProjectDescription("  vision prototype  "), "vision prototype");
  assert.throws(() => validateProjectDescription(" "));
  assert.throws(() => validateProjectDescription("x".repeat(MAX_PROJECT_LENGTH + 1)));
});

test("builds a structured-output request constrained to catalog equipment", () => {
  const request = buildGeminiRequest("a camera for plant vision", equipment);
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(
    request.generationConfig.responseSchema.properties.recommendations.items.properties.equipmentId.enum,
    equipment.map(item => item.id),
  );
  assert.equal(request.contents[0].role, "user");
});

test("accepts only catalog recommendations and limits output to three", () => {
  const result = parseGeminiRecommendations(JSON.stringify({
    recommendations: [
      { equipmentId: "jetson", explanation: "Supports edge computer vision." },
      { equipmentId: "unknown", explanation: "Not in the catalog." },
      { equipmentId: "jetson", explanation: "Duplicate." },
      { equipmentId: "gpu", explanation: "Accelerates model training." },
      { equipmentId: "scope", explanation: "Measures circuit signals." },
      { equipmentId: "pi", explanation: "Connects sensor devices." },
    ],
  }), equipment);

  assert.deepEqual(result.map(item => item.id), ["jetson", "gpu", "scope"]);
  assert.equal(result[0].explanation, "Supports edge computer vision.");
  assert.equal(result[0].location, "Lab A");
});

test("rejects malformed or wholly hallucinated provider output", () => {
  assert.throws(() => parseGeminiRecommendations("not json", equipment));
  assert.throws(() => parseGeminiRecommendations(JSON.stringify({
    recommendations: [{ equipmentId: "not-listed", explanation: "Invented resource." }],
  }), equipment));
  assert.throws(() => parseGeminiRecommendations(JSON.stringify({
    recommendations: [{ equipmentId: "jetson", explanation: "  " }],
  }), equipment));
  assert.deepEqual(parseGeminiRecommendations(JSON.stringify({ recommendations: [] }), equipment), []);
});
