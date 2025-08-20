import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para limpiar referencias al eliminar
userSchema.pre('remove', async function(next) {
  await this.model('Sale').deleteMany({ vendedor_id: this._id });
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
