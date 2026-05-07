import Word from '../models/Word.js';
import UserWord from '../models/UserWord.js';
import User from '../models/User.js';
import { getExternalWordSource } from '../services/externalWordSource.service.js';

const normalizeSpaces = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeKey = (value) => normalizeSpaces(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const capitalizeFirst = (value) => {
    const clean = normalizeSpaces(value);
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const createWord = async (req, res) => {
    try {
        const { nameRu, nameEn, nameTatar, transcription, descriptionRu } = req.body;
        const exists = await Word.findOne({ nameRu: capitalizeFirst(nameRu) });
        if (exists) return res.status(409).json({ message: 'Слово уже существует' });

        const word = await Word.create({
            nameRu: capitalizeFirst(nameRu),
            nameEn: normalizeSpaces(nameEn),
            nameTatar: capitalizeFirst(nameTatar),
            transcription: normalizeSpaces(transcription),
            descriptionRu: normalizeSpaces(descriptionRu),
            source: 'manual'
        });
        res.status(201).json(word);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка при создании' });
    }
};

export const getWords = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query; // лимит 10
        const q = normalizeKey(search);
        let query = {};

        if (search && search.trim() !== '') {
            const s = search.trim();
            query = {
                $or: [
                    { nameRu: { $regex: s, $options: 'i' } },
                    { nameEn: { $regex: s, $options: 'i' } },
                    { nameTatar: { $regex: s, $options: 'i' } }
                ]
            };
        }

        const mongoWords = await Word.find(query)
            .sort({ createdAt: -1 })
            .lean();

        const source = await getExternalWordSource();
        const importedIdSet = new Set(mongoWords.map((word) => word.externalWordId).filter(Boolean));
        const importedNameSet = new Set(mongoWords.map((word) => `${normalizeKey(word.nameEn)}::${normalizeKey(word.nameTatar)}`));

        const externalCandidates = (source?.words || [])
            .filter((word) => {
                const key = `${normalizeKey(word.nameEn)}::${normalizeKey(word.nameTatar)}`;
                if (importedIdSet.has(word.id) || importedNameSet.has(key)) return false;
                if (!q) return true;
                return [word.nameRu, word.nameEn, word.nameTatar].some((value) => normalizeKey(value).includes(q));
            })
            .map((word) => ({
                _id: word.id,
                id: word.id,
                externalWordId: word.id,
                nameRu: capitalizeFirst(word.nameRu),
                nameEn: normalizeSpaces(word.nameEn),
                nameTatar: capitalizeFirst(word.nameTatar),
                transcription: normalizeSpaces(word.transcription),
                descriptionRu: normalizeSpaces(word.descriptionRu || word.description),
                source: 'rodon.org',
                isExternalCandidate: true
            }));

        const combined = [
            ...mongoWords.map((word) => ({
                ...word,
                source: word.source || 'manual',
                isExternalCandidate: false
            })),
            ...externalCandidates
        ];
        const totalItems = combined.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / Number(limit)));
        const currentPage = Number(page);
        const words = combined.slice((currentPage - 1) * Number(limit), currentPage * Number(limit));

        res.json({
            words,
            totalPages,
            currentPage,
            totalItems
        });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера' });
    }
};

export const updateWord = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.nameRu !== undefined) payload.nameRu = capitalizeFirst(payload.nameRu);
        if (payload.nameTatar !== undefined) payload.nameTatar = capitalizeFirst(payload.nameTatar);
        if (payload.nameEn !== undefined) payload.nameEn = normalizeSpaces(payload.nameEn);
        if (payload.transcription !== undefined) payload.transcription = normalizeSpaces(payload.transcription);
        if (payload.descriptionRu !== undefined) payload.descriptionRu = normalizeSpaces(payload.descriptionRu);

        const word = await Word.findByIdAndUpdate(req.params.id, payload, { new: true });
        res.json(word);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка обновления' });
    }
};

export const deleteWord = async (req, res) => {
    try {
        const { id } = req.params;
        await UserWord.deleteMany({ word: id });
        await User.updateMany({ dictionary: id }, { $pull: { dictionary: id } });
        await Word.findByIdAndDelete(id);
        res.json({ message: 'Удалено' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка удаления' });
    }
};

export const importExternalWords = async (req, res) => {
    try {
        const wordIds = Array.isArray(req.body?.wordIds) ? req.body.wordIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
        const overwrite = Boolean(req.body?.overwrite);
        if (!wordIds.length) {
            return res.status(400).json({ message: 'Нужно передать wordIds' });
        }

        const source = await getExternalWordSource();
        const byId = new Map((source?.words || []).map((word) => [String(word.id), word]));

        const result = {
            requested: wordIds.length,
            imported: 0,
            updated: 0,
            skipped: 0,
            missing: []
        };

        const operations = [];
        for (const externalId of wordIds) {
            const externalWord = byId.get(externalId);
            if (!externalWord) {
                result.missing.push(externalId);
                continue;
            }

            const payload = {
                nameRu: capitalizeFirst(externalWord.nameRu),
                nameEn: normalizeSpaces(externalWord.nameEn),
                nameTatar: capitalizeFirst(externalWord.nameTatar),
                transcription: normalizeSpaces(externalWord.transcription),
                descriptionRu: normalizeSpaces(externalWord.descriptionRu || externalWord.description),
                externalWordId: externalId,
                source: 'external',
                isActive: true
            };

            const existing = await Word.findOne({
                $or: [
                    { externalWordId: externalId },
                    {
                        nameEn: payload.nameEn,
                        nameTatar: payload.nameTatar
                    }
                ]
            }).select('_id externalWordId');

            if (!existing) {
                operations.push({ insertOne: { document: payload } });
                result.imported += 1;
                continue;
            }

            if (!overwrite) {
                result.skipped += 1;
                continue;
            }

            operations.push({
                updateOne: {
                    filter: { _id: existing._id },
                    update: { $set: payload }
                }
            });
            result.updated += 1;
        }

        if (operations.length > 0) {
            await Word.bulkWrite(operations, { ordered: false });
        }

        res.json({
            message: 'Импорт завершен',
            ...result
        });
    } catch (err) {
        console.error('importExternalWords error:', err);
        res.status(500).json({ message: 'Ошибка импорта внешних слов' });
    }
};

export const cleanupExternalImportedWords = async (req, res) => {
    try {
        const externalWords = await Word.find({
            $or: [
                { source: 'external' },
                { source: 'rodon.org' },
                { externalWordId: { $exists: true, $ne: null } }
            ]
        }).select('_id');
        const ids = externalWords.map((word) => word._id);

        if (ids.length > 0) {
            const userWords = await UserWord.find({ word: { $in: ids } }).select('_id');
            const userWordIds = userWords.map((item) => item._id);
            await UserWord.deleteMany({ _id: { $in: userWordIds } });
            await User.updateMany({}, { $pull: { dictionary: { $in: userWordIds } } });
            await Word.deleteMany({ _id: { $in: ids } });
        }

        res.json({ message: 'Внешние импортированные слова удалены', deleted: ids.length });
    } catch (err) {
        console.error('cleanupExternalImportedWords error:', err);
        res.status(500).json({ message: 'Ошибка очистки внешних слов' });
    }
};
