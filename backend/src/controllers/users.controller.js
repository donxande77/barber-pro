import * as userService from '../services/user.service.js';

export const list = async (req, res) => res.json(await userService.listUsers(req.ctx, req.valid.query));
export const get = async (req, res) => res.json(await userService.getUser(req.ctx, req.valid.params.id));
export const create = async (req, res) => res.status(201).json(await userService.createUser(req.ctx, req.valid.body));
export const update = async (req, res) =>
  res.json(await userService.updateUser(req.ctx, req.valid.params.id, req.valid.body));
