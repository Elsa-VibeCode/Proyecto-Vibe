import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
      required() {
        return !this.clerkId;
      },
    },
    rol: {
      type: String,
      enum: ['admin', 'editor', 'visor'],
      default: 'visor',
    },
    activo: {
      type: Boolean,
      default: true,
    },
    ultimoAcceso: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.nombre && this.email) {
    this.nombre = this.email.split('@')[0];
  }

  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.compararPassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export const User = mongoose.model('User', userSchema);
