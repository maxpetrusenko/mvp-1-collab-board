const { applyBatchColorMutation } = require('./bulk-operations')

const changeColors = async (ctx, args = {}, dependencies = {}) => {
  const objectIds = Array.isArray(args.objectIds) ? args.objectIds : []
  const targetColor = args?.color

  if (!targetColor) {
    return { count: 0 }
  }

  return applyBatchColorMutation(ctx, objectIds, targetColor, dependencies)
}

module.exports = {
  changeColors,
}
