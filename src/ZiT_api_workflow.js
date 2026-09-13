// src/ZiT_api_workflow.js
export const zImageWorkflow = {
  "9": { "inputs": { "filename_prefix": "ComfyUI", "images": ["65", 0] }, "class_type": "SaveImage" },
  "62": { "inputs": { "clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default" }, "class_type": "CLIPLoader" },
  "63": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
  "65": { "inputs": { "samples": ["70", 0], "vae": ["63", 0] }, "class_type": "VAEDecode" },
  "66": { "inputs": { "unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" },
  "67": { "inputs": { "text": "prompt here", "clip": ["62", 0] }, "class_type": "CLIPTextEncode" },
  "68": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptySD3LatentImage" },
  "69": { "inputs": { "shift": 3, "model": ["66", 0] }, "class_type": "ModelSamplingAuraFlow" },
  "70": { "inputs": { "seed": 42, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1, "model": ["69", 0], "positive": ["67", 0], "negative": ["71", 0], "latent_image": ["68", 0] }, "class_type": "KSampler" },
  "71": { "inputs": { "text": "low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs", "clip": ["62", 0] }, "class_type": "CLIPTextEncode" }
};
