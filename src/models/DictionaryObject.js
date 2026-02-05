import mongoose from 'mongoose';

const DictionaryObjectSchema = new mongoose.Schema({
    nameRu: String,
    nameTatar: String,
    transcription: String,
    descriptionRu: String,
    userPhoto: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

export default mongoose.model('DictionaryObject', DictionaryObjectSchema);
