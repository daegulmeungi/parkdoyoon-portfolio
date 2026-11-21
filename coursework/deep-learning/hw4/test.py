import sys
import os
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    DataCollatorWithPadding,
)

# ---------------- 1. 인자 읽기 ----------------
if len(sys.argv) != 3:
    print("Usage: python test.py [data_dir] [model_name]")
    sys.exit(1)

data_dir = sys.argv[1]
model_name = sys.argv[2]

# ---------------- 2. 모델 로드 ----------------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("device =", device)
print("model_name =", model_name)

if model_name == "my_model":
    model_path = "./my_model"
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSequenceClassification.from_pretrained(model_path)
else:
    raise ValueError(f"Unknown model_name: {model_name}")

model.to(device)
model.eval()

# ---------------- 3. test 데이터셋 ----------------
class IMDBTestDataset(Dataset):
    def __init__(self, texts, tokenizer, max_len=320):
        self.texts = texts
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = self.texts[idx]
        enc = self.tokenizer(
            text,
            truncation=True,
            padding=False,
            max_length=self.max_len,
            return_tensors="pt",
        )
        enc = {k: v.squeeze(0) for k, v in enc.items()}
        return enc

test_root = os.path.join(data_dir, "test")

test_texts = []
file_paths = []

for subdir, _, files in os.walk(test_root):
    for fname in files:
        if not fname.endswith(".txt"):
            continue
        full_path = os.path.join(subdir, fname)
        file_paths.append(full_path)

file_paths = sorted(file_paths)

for path in file_paths:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read().strip()
        test_texts.append(text)

print(f"#test samples = {len(test_texts)}")

test_dataset = IMDBTestDataset(test_texts, tokenizer)
data_collator = DataCollatorWithPadding(tokenizer=tokenizer, return_tensors="pt")

test_loader = DataLoader(
    test_dataset,
    batch_size=16,
    shuffle=False,
    collate_fn=data_collator,
)

# ---------------- 4. inference + result.tsv ----------------
results = []
idx = 0

with torch.no_grad():
    for batch in test_loader:
        batch = {k: v.to(device) for k, v in batch.items()}
        outputs = model(**batch)
        logits = outputs.logits
        preds = torch.argmax(logits, dim=-1)

        for p in preds.cpu().tolist():
            label_str = "pos" if p == 1 else "neg"
            results.append((idx, label_str))
            idx += 1

with open("result.tsv", "w", encoding="utf-8") as f:
    for i, label in results:
        f.write(f"{i}\t{label}\n")

print("Saved predictions to result.tsv")
